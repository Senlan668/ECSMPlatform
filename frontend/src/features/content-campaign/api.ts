import { useEffect, useState } from 'react'
import { useBusinessBlobApi } from '../../lib/businessApi'

export const campaignPath = (path: string) => `/api/v1/content-campaign${path}`

export const campaignMediaPath = (url?: string | null) => {
  if (!url) return ''
  if (url.startsWith('/static/')) return campaignPath(url)
  return url
}

export interface RuntimeCapabilities {
  service: string
  storage: { database: string; vector_store: string }
  workflow: { checkpoint_backend: string }
  dependencies: Record<'llm' | 'image' | 'tts' | 'remotion', string>
}

export interface WorkflowThread {
  thread_id: string
  topic_direction: string
  selected_topic: string
  status: string
  is_completed: boolean
  created_at?: string | null
}

export interface WorkflowState {
  thread_id: string
  status: string
  values: Record<string, unknown>
  next_nodes: string[]
  is_completed: boolean
  interrupt_info?: { action_required?: string; options?: string[]; article_preview?: string } | null
  node_metrics?: Array<Record<string, unknown>>
}

export interface GalleryWork {
  id: string
  title?: string | null
  mode: string
  tags: string[]
  aspect_ratio?: string | null
  image_url?: string | null
  thumbnail_url?: string | null
  is_favorite: boolean
  is_template: boolean
  created_at?: string | null
}

export interface PosterResult {
  success: boolean
  image_url?: string | null
  error?: string | null
  mode?: string | null
  aspect_ratio?: string | null
  prompt_used?: string | null
  images?: Array<{ url: string; ratio?: string }>
}

export const IMAGE_FILE_ACCEPT = 'image/png,image/jpeg,image/webp'
export const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024
export const MAX_REFERENCE_IMAGES = 4

const supportedImageTypes = new Set(IMAGE_FILE_ACCEPT.split(','))

export function validateImageFile(file: File) {
  if (!supportedImageTypes.has(file.type)) {
    throw new Error('仅支持 PNG、JPEG 或 WebP 图片')
  }
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    throw new Error('单张图片不能超过 10MB')
  }
}

export async function fileAsBase64(file: File) {
  validateImageFile(file)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
  return { dataUrl, base64: dataUrl.split(',', 2)[1] || '', contentType: file.type || 'application/octet-stream' }
}

export function useCampaignMedia(url?: string | null) {
  const requestBlob = useBusinessBlobApi()
  const [source, setSource] = useState('')

  useEffect(() => {
    let objectUrl = ''
    let cancelled = false
    setSource('')
    const path = campaignMediaPath(url)
    if (!path) return
    if (/^https?:\/\//.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
      setSource(path)
      return
    }
    void requestBlob(path).then(download => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(download.blob)
      setSource(objectUrl)
    }).catch(() => setSource(''))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [requestBlob, url])

  return source
}
