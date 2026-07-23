import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg'
import bundledCoreScriptUrl from '@ffmpeg/core?url'
import bundledCoreWasmUrl from '@ffmpeg/core/wasm?url'

interface FFmpegCoreUrls {
  coreURL: string
  wasmURL: string
}

interface GetSharedFFmpegOptions {
  onLoadProgress?: (message: string) => void
  loadingMessage?: string
  readyMessage?: string | null
  signal?: AbortSignal
}

interface CleanupOptions {
  mounts?: string[]
  directories?: string[]
  files?: string[]
}

const coreCandidates = [
  { label: 'bundled @ffmpeg/core asset', scriptUrl: bundledCoreScriptUrl, wasmUrl: bundledCoreWasmUrl },
  { label: 'public ffmpeg fallback', scriptUrl: '/ffmpeg/ffmpeg-core.js', wasmUrl: '/ffmpeg/ffmpeg-core.wasm' },
]

async function createValidatedBlobUrl(assetUrl: string, mimeType: string): Promise<string> {
  const response = await fetch(assetUrl)
  if (!response.ok) throw new Error(`加载 ${assetUrl} 失败（HTTP ${response.status}）`)

  if (mimeType === 'text/javascript') {
    const source = await response.text()
    if (source.trimStart().startsWith('<')) throw new Error(`${assetUrl} 返回了 HTML，而不是 JavaScript`)
    return URL.createObjectURL(new Blob([source], { type: mimeType }))
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  const prefix = new TextDecoder().decode(bytes.slice(0, 32)).trimStart()
  if (prefix.startsWith('<')) throw new Error(`${assetUrl} 返回了 HTML，而不是 WebAssembly`)
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }))
}

async function resolveCoreUrls(): Promise<FFmpegCoreUrls> {
  let lastError: unknown
  for (const candidate of coreCandidates) {
    try {
      return {
        coreURL: await createValidatedBlobUrl(candidate.scriptUrl, 'text/javascript'),
        wasmURL: await createValidatedBlobUrl(candidate.wasmUrl, 'application/wasm'),
      }
    } catch (reason) {
      lastError = reason
      console.warn(`[FFmpegRuntime] ${candidate.label} 加载失败`, reason)
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : '无法加载 FFmpeg 核心资源')
}

export function createAbortError(): DOMException {
  return new DOMException('本地媒体处理已取消', 'AbortError')
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError()
}

export function watchAbort(signal: AbortSignal | undefined, onAbort: () => void): () => void {
  if (!signal) return () => undefined
  const handler = () => onAbort()
  signal.addEventListener('abort', handler, { once: true })
  return () => signal.removeEventListener('abort', handler)
}

export async function ensureDir(ffmpeg: FFmpeg, path: string) {
  try {
    await ffmpeg.createDir(path)
  } catch {
    // A reused runtime may already contain the directory.
  }
}

export async function mountWorkerFile(ffmpeg: FFmpeg, file: File, mountPoint: string): Promise<string> {
  await ensureDir(ffmpeg, mountPoint)
  await ffmpeg.mount(FFFSType.WORKERFS, { files: [file] }, mountPoint)
  return `${mountPoint}/${file.name}`
}

export async function cleanupFfmpegPaths(ffmpeg: FFmpeg, options: CleanupOptions) {
  for (const mountPath of options.mounts ?? []) {
    try { await ffmpeg.unmount(mountPath) } catch { /* Runtime may have been terminated. */ }
  }
  for (const filePath of options.files ?? []) {
    try { await ffmpeg.deleteFile(filePath) } catch { /* Partial executions may not create output. */ }
  }
  for (const directoryPath of options.directories ?? []) {
    try { await ffmpeg.deleteDir(directoryPath) } catch { /* Directory may be non-existent after abort. */ }
  }
}

export function createSharedFFmpegRuntime() {
  let ffmpeg: FFmpeg | null = null
  let loadPromise: Promise<FFmpeg> | null = null

  const reset = () => {
    ffmpeg = null
    loadPromise = null
  }

  const getFFmpeg = async ({
    onLoadProgress,
    loadingMessage = '正在加载 FFmpeg 引擎...',
    readyMessage = 'FFmpeg 引擎就绪',
    signal,
  }: GetSharedFFmpegOptions = {}): Promise<FFmpeg> => {
    if (ffmpeg && loadPromise) return loadPromise

    const instance = new FFmpeg()
    ffmpeg = instance
    loadPromise = (async () => {
      onLoadProgress?.(loadingMessage)
      const stopWatchingAbort = watchAbort(signal, () => {
        instance.terminate()
        reset()
      })
      try {
        throwIfAborted(signal)
        const urls = await resolveCoreUrls()
        await instance.load(urls, signal ? { signal } : undefined)
        if (readyMessage) onLoadProgress?.(readyMessage)
        return instance
      } catch (reason) {
        reset()
        throw reason
      } finally {
        stopWatchingAbort()
      }
    })()
    return loadPromise
  }

  return { getFFmpeg, reset }
}
