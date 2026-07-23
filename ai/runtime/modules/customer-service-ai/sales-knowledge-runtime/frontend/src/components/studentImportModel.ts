import type { StudentData } from '../api'
import type { StudentChannel, StudentStatus, StudentView } from './studentManagementModel.ts'
import { toStudentPayload } from './studentManagementModel.ts'

export type ImportedStudentDraft = Omit<StudentView, 'id' | 'mainReportMaterialId' | 'mainReportMaterial' | 'reportMaterials'>

const toText = (value: unknown): string => {
  if (value == null) return ''
  return String(value)
}

const toChannel = (value: unknown): StudentChannel => {
  return value === '抖音' ? '抖音' : '微信'
}

const toStatus = (value: unknown): StudentStatus => {
  return value === 'graduated' || value === 'dropped' ? value : 'active'
}

export const toImportedStudentDraft = (student: Partial<StudentData>): ImportedStudentDraft => ({
  name: toText(student.name),
  channel: toChannel(student.channel),
  jobTitle: toText(student.job_title),
  preSalary: toText(student.pre_salary),
  postSalary: student.post_salary == null ? null : toText(student.post_salary),
  bday: toText(student.bday),
  city: toText(student.city),
  education: toText(student.education),
  graduationCohort: toText(student.graduation_cohort),
  enrollDate: toText(student.enroll_date),
  graduationDate: student.graduation_date == null ? null : toText(student.graduation_date),
  phone: toText(student.phone),
  douyinOrder: toText(student.douyin_order),
  className: toText(student.class_name),
  status: toStatus(student.status),
})

export const getImportPayloads = (drafts: ImportedStudentDraft[]) => {
  return drafts
    .filter((draft) => draft.name.trim() || draft.phone.trim())
    .map((draft) =>
      toStudentPayload({
        ...draft,
        mainReportMaterialId: null,
        mainReportMaterial: null,
        reportMaterials: [],
      }),
    )
}
