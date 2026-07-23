import type { Material } from '../types'

export function getMaterialDisplayName(material: Pick<Material, 'filename' | 'title'>): string {
  const title = material.title?.trim()
  return title || material.filename
}

const pad2 = (num: number) => String(num).padStart(2, '0')

export function getMaterialUploadTime(material: Pick<Material, 'created_at'>): string {
  const date = new Date(material.created_at)
  if (Number.isNaN(date.getTime())) return '未知时间'

  return `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日 ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}
