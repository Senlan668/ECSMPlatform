import { cleanupFfmpegPaths, createAbortError, createSharedFFmpegRuntime, mountWorkerFile, throwIfAborted, watchAbort } from './ffmpegRuntime'

export interface ExtractProgress {
  ratio: number
  message: string
}

export interface ExtractedAudio {
  blob: Blob
  filename: string
  startOffset: number
  videoDuration: number | null
}

const audioRuntime = createSharedFFmpegRuntime()

export async function extractAudio(
  videoFile: File,
  onProgress?: (progress: ExtractProgress) => void,
  signal?: AbortSignal,
): Promise<ExtractedAudio> {
  onProgress?.({ ratio: 0, message: '正在初始化音频引擎...' })
  const ffmpeg = await audioRuntime.getFFmpeg({
    onLoadProgress: message => onProgress?.({ ratio: 0.05, message }),
    loadingMessage: '正在加载音频引擎...',
    readyMessage: '音频引擎就绪',
    signal,
  })
  const progressHandler = ({ progress }: { progress: number }) => {
    const ratio = Math.min(Math.max(progress, 0), 1)
    onProgress?.({ ratio: 0.1 + ratio * 0.85, message: `正在提取音频... ${Math.round(ratio * 100)}%` })
  }
  ffmpeg.on('progress', progressHandler)

  const mountPoint = '/input'
  const outputName = '/output.mp3'
  let aborted = false
  const stopWatchingAbort = watchAbort(signal, () => {
    aborted = true
    ffmpeg.terminate()
    audioRuntime.reset()
  })

  try {
    throwIfAborted(signal)
    onProgress?.({ ratio: 0.05, message: '正在挂载视频文件...' })
    const inputPath = await mountWorkerFile(ffmpeg, videoFile, mountPoint)

    let startOffset = 0
    let videoDuration: number | null = null
    const logLines: string[] = []
    const logHandler = ({ message }: { message: string }) => logLines.push(message)
    ffmpeg.on('log', logHandler)
    try {
      await ffmpeg.exec(['-i', inputPath, '-t', '0.01', '-f', 'null', '-'], -1, signal ? { signal } : undefined)
    } catch {
      // ffmpeg writes probe information to its log even when no output is produced.
    }
    ffmpeg.off('log', logHandler)

    for (const line of logLines) {
      const durationMatch = line.match(/Duration:\s+(\d+):(\d+):([\d.]+)/)
      if (durationMatch && videoDuration === null) {
        videoDuration = Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
      }
      const startMatch = line.match(/start:\s+([\d.]+)/)
      if (startMatch && Number(startMatch[1]) > 1) startOffset = Number(startMatch[1])
    }

    onProgress?.({ ratio: 0.1, message: '开始提取音频...' })
    const exitCode = await ffmpeg.exec([
      '-i', inputPath,
      '-vn',
      '-acodec', 'libmp3lame',
      '-ar', '16000',
      '-ac', '1',
      '-b:a', '64k',
      '-y', outputName,
    ], -1, signal ? { signal } : undefined)
    if (exitCode !== 0) throw new Error(`FFmpeg 音频提取失败（退出码 ${exitCode}）`)

    onProgress?.({ ratio: 0.95, message: '正在读取音频结果...' })
    const data = await ffmpeg.readFile(outputName, 'binary', signal ? { signal } : undefined)
    const bytes = new Uint8Array(data as Uint8Array)
    const blob = new Blob([bytes.buffer], { type: 'audio/mpeg' })
    const filename = `${videoFile.name.replace(/\.[^/.]+$/, '')}.mp3`
    onProgress?.({ ratio: 1, message: '音频提取完成' })
    return { blob, filename, startOffset, videoDuration }
  } catch (reason) {
    if (aborted || signal?.aborted) throw createAbortError()
    throw reason
  } finally {
    stopWatchingAbort()
    ffmpeg.off('progress', progressHandler)
    await cleanupFfmpegPaths(ffmpeg, { mounts: [mountPoint], directories: [mountPoint], files: [outputName] })
    if (aborted || signal?.aborted) audioRuntime.reset()
  }
}
