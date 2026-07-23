export type StudentModalCloseSource = 'header' | 'backdrop'

export const canCloseStudentModal = (
  source: StudentModalCloseSource,
  isBusy: boolean,
): boolean => {
  if (isBusy) {
    return false
  }

  return source === 'header'
}
