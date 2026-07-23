import type { Material } from '../types'

export interface MaterialPreviewNavigation {
  previous: Material | null
  next: Material | null
}

const isReportPreviewImage = (material: Material): boolean => (
  material.category === 'report'
  && material.file_type !== 'folder'
  && material.file_type.startsWith('image/')
)

export const getMaterialPreviewNavigation = (
  materials: Material[],
  currentMaterialId: number | null | undefined,
): MaterialPreviewNavigation => {
  if (currentMaterialId == null) {
    return { previous: null, next: null }
  }

  const previewable = materials.filter(isReportPreviewImage)
  const currentIndex = previewable.findIndex(material => material.id === currentMaterialId)
  if (currentIndex < 0) {
    return { previous: null, next: null }
  }

  return {
    previous: currentIndex > 0 ? previewable[currentIndex - 1] : null,
    next: currentIndex < previewable.length - 1 ? previewable[currentIndex + 1] : null,
  }
}
