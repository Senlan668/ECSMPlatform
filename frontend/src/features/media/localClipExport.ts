export interface LocalClipSpec {
  clipIndex: number
  title: string
  startTime: number
  endTime: number
  duration: number
  outputName: string
}

export interface LocalClipExportFailure {
  clipIndex: number
  title: string
  reason: string
}

export interface ExportableClip {
  clipIndex: number
  title: string
  startTime: number
  endTime: number
}

export function buildLocalClipSpecs(clips: ExportableClip[], videoStartOffset = 0): LocalClipSpec[] {
  const offset = videoStartOffset > 1 ? videoStartOffset : 0
  return clips.map(clip => {
    const startTime = Math.max(0, clip.startTime - offset)
    const endTime = Math.max(0, clip.endTime - offset)
    return {
      ...clip,
      startTime,
      endTime,
      duration: endTime - startTime,
      outputName: `${String(clip.clipIndex).padStart(2, '0')}_${sanitizeClipTitle(clip.title)}.mp4`,
    }
  }).filter(clip => clip.duration > 0)
}

export function buildClipArchiveName(videoFilename: string): string {
  const baseName = videoFilename.replace(/\.[^.]+$/, '') || 'AI切片'
  return `${baseName}_AI切片.zip`
}

function sanitizeClipTitle(title: string): string {
  const cleaned = title.replace(/[/\\:*?"<>|]/g, '_').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 50) : '未命名片段'
}
