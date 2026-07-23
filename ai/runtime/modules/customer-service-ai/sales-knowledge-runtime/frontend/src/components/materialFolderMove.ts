import type { Material } from '../types'

export interface MaterialMoveTarget {
  folder_id: number | null
  successMessage: string
}

export interface MaterialMoveSuccessState {
  materials: Material[]
  draggingMaterialId: null
  dropFolderId: null
  dropOnRoot: false
}

export interface GetMoveTargetInput {
  currentFolderId: number | null
  targetFolderId: number | null
  searchQuery: string
}

export function canDragMaterialMove(searchQuery: string): boolean {
  return searchQuery.trim().length === 0
}

export function getMoveTarget({
  currentFolderId,
  targetFolderId,
  searchQuery,
}: GetMoveTargetInput): MaterialMoveTarget | null {
  if (!canDragMaterialMove(searchQuery)) {
    return null
  }

  if (currentFolderId === targetFolderId) {
    return null
  }

  return {
    folder_id: targetFolderId,
    successMessage: targetFolderId == null ? '已移回根目录' : '已移动到文件夹',
  }
}

export function removeMovedMaterialFromCurrentView(
  materials: Material[],
  materialId: number,
): Material[] {
  return materials.filter((item) => item.id !== materialId)
}

export function buildMaterialMoveSuccessState(
  materials: Material[],
  materialId: number,
): MaterialMoveSuccessState {
  return {
    materials: removeMovedMaterialFromCurrentView(materials, materialId),
    draggingMaterialId: null,
    dropFolderId: null,
    dropOnRoot: false,
  }
}
