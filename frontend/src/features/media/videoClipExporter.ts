import { zipSync } from 'fflate'
import { buildLocalClipSpecs, type ExportableClip, type LocalClipExportFailure } from './localClipExport'
import { cleanupFfmpegPaths, createAbortError, createSharedFFmpegRuntime, ensureDir, mountWorkerFile, throwIfAborted, watchAbort } from './ffmpegRuntime'

export interface LocalClipExportProgress {
  stage: 'loading' | 'reading' | 'clipping' | 'zipping' | 'done'
  currentClip: number
  totalClips: number
  message: string
}

interface ExportVideoClipsLocallyOptions {
  videoFile: File
  clips: ExportableClip[]
  videoStartOffset?: number
  onProgress?: (progress: LocalClipExportProgress) => void
  signal?: AbortSignal
}

export interface LocalClipExportResult {
  blob: Blob
  succeeded: number
  failed: LocalClipExportFailure[]
}

const clipRuntime = createSharedFFmpegRuntime()

export async function exportVideoClipsLocally({
  videoFile,
  clips,
  videoStartOffset = 0,
  onProgress,
  signal,
}: ExportVideoClipsLocallyOptions): Promise<LocalClipExportResult> {
  const ffmpeg = await clipRuntime.getFFmpeg({
    onLoadProgress: message => onProgress?.({ stage: 'loading', currentClip: 0, totalClips: clips.length, message }),
    loadingMessage: '正在加载本地切片引擎...',
    readyMessage: null,
    signal,
  })
  const specs = buildLocalClipSpecs(clips, videoStartOffset)
  if (specs.length !== clips.length) throw new Error('存在无效时间范围，无法导出')

  const inputDir = '/input'
  const outputDir = '/output'
  const archiveEntries: Record<string, Uint8Array> = {}
  const failed: LocalClipExportFailure[] = []
  let aborted = false
  const stopWatchingAbort = watchAbort(signal, () => {
    aborted = true
    ffmpeg.terminate()
    clipRuntime.reset()
  })

  try {
    throwIfAborted(signal)
    onProgress?.({ stage: 'reading', currentClip: 0, totalClips: specs.length, message: '正在读取视频文件...' })
    await ensureDir(ffmpeg, inputDir)
    await ensureDir(ffmpeg, outputDir)
    const inputPath = await mountWorkerFile(ffmpeg, videoFile, inputDir)

    for (const [index, clip] of specs.entries()) {
      throwIfAborted(signal)
      onProgress?.({
        stage: 'clipping',
        currentClip: index + 1,
        totalClips: specs.length,
        message: `正在导出片段 ${index + 1} / ${specs.length}`,
      })
      const outputPath = `${outputDir}/${clip.outputName}`
      try {
        const copyExitCode = await ffmpeg.exec([
          '-ss', clip.startTime.toFixed(3),
          '-i', inputPath,
          '-t', clip.duration.toFixed(3),
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          '-y', outputPath,
        ], -1, signal ? { signal } : undefined)
        if (copyExitCode !== 0) {
          try { await ffmpeg.deleteFile(outputPath) } catch { /* Failed muxes may not create a file. */ }
          const transcodeExitCode = await ffmpeg.exec([
            '-ss', clip.startTime.toFixed(3),
            '-i', inputPath,
            '-t', clip.duration.toFixed(3),
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-c:a', 'aac',
            '-b:a', '96k',
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero',
            '-y', outputPath,
          ], -1, signal ? { signal } : undefined)
          if (transcodeExitCode !== 0) {
            throw new Error(`流复制退出码 ${copyExitCode}，兼容转码退出码 ${transcodeExitCode}`)
          }
        }
        const data = await ffmpeg.readFile(outputPath, 'binary', signal ? { signal } : undefined)
        archiveEntries[clip.outputName] = new Uint8Array(data as Uint8Array)
        await ffmpeg.deleteFile(outputPath)
      } catch (reason) {
        if (signal?.aborted) throw createAbortError()
        failed.push({ clipIndex: clip.clipIndex, title: clip.title, reason: reason instanceof Error ? reason.message : String(reason) })
      }
    }

    if (Object.keys(archiveEntries).length === 0) {
      const reason = failed[0]?.reason ? `：${failed[0].reason}` : ''
      throw new Error(`所有片段导出失败，未生成可下载文件${reason}`)
    }
    onProgress?.({ stage: 'zipping', currentClip: specs.length, totalClips: specs.length, message: '正在打包 ZIP...' })
    const zipBytes = new Uint8Array(zipSync(archiveEntries))
    const result = {
      blob: new Blob([zipBytes.buffer], { type: 'application/zip' }),
      succeeded: Object.keys(archiveEntries).length,
      failed,
    }
    onProgress?.({ stage: 'done', currentClip: specs.length, totalClips: specs.length, message: 'ZIP 已生成' })
    return result
  } catch (reason) {
    if (aborted || signal?.aborted) throw createAbortError()
    throw reason
  } finally {
    stopWatchingAbort()
    await cleanupFfmpegPaths(ffmpeg, { mounts: [inputDir], directories: [outputDir, inputDir] })
    if (aborted || signal?.aborted) clipRuntime.reset()
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
