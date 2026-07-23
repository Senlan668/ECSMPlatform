export interface StudentPageState<T> {
  items: T[]
  currentPage: number
  totalPages: number
  startIndex: number
  endIndex: number
  hasPrevious: boolean
  hasNext: boolean
}

const clampPage = (page: number, totalPages: number): number => {
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(Math.floor(page), 1), totalPages)
}

export const getStudentPageState = <T>(
  items: T[],
  requestedPage: number,
  pageSize: number,
): StudentPageState<T> => {
  const normalizedPageSize = Math.max(Math.floor(pageSize), 1)
  const totalPages = Math.max(Math.ceil(items.length / normalizedPageSize), 1)
  const currentPage = clampPage(requestedPage, totalPages)

  if (items.length === 0) {
    return {
      items: [],
      currentPage,
      totalPages,
      startIndex: 0,
      endIndex: 0,
      hasPrevious: false,
      hasNext: false,
    }
  }

  const startOffset = (currentPage - 1) * normalizedPageSize
  const pagedItems = items.slice(startOffset, startOffset + normalizedPageSize)

  return {
    items: pagedItems,
    currentPage,
    totalPages,
    startIndex: startOffset + 1,
    endIndex: startOffset + pagedItems.length,
    hasPrevious: currentPage > 1,
    hasNext: currentPage < totalPages,
  }
}
