export type StudentChannel = '微信' | '抖音'
export type StudentStatus = 'active' | 'graduated' | 'dropped'

export interface StudentReportSummary {
  id: number
  filename: string
  title: string | null
  fileType: string
  category: string
  ossKey: string | null
  isPrimary: boolean
  createdAt: string | null
}

export interface StudentView {
  id: number
  name: string
  channel: StudentChannel
  jobTitle: string
  preSalary: string
  postSalary: string | null
  bday: string
  city: string
  education: string
  graduationCohort: string
  enrollDate: string
  graduationDate: string | null
  phone: string
  douyinOrder: string
  className: string
  mainReportMaterialId: number | null
  mainReportMaterial: StudentReportSummary | null
  reportMaterials: StudentReportSummary[]
  status: StudentStatus
}

export interface StudentReportSummaryApiData {
  id: number
  filename: string
  title: string | null
  file_type: string | null
  category: string | null
  oss_key: string | null
  is_primary?: boolean
  created_at: string | null
}

export interface StudentApiData {
  id: number
  name: string
  channel: string
  job_title: string | null
  pre_salary: string | null
  post_salary: string | null
  bday: string | null
  city: string | null
  education: string | null
  graduation_cohort: string | null
  enroll_date: string | null
  graduation_date: string | null
  phone: string | null
  douyin_order: string | null
  class_name: string | null
  main_report_material_id: number | null
  main_report_material: StudentReportSummaryApiData | null
  report_materials?: StudentReportSummaryApiData[]
  status: string
}

export interface StudentUpdatePayload {
  name: string
  channel: StudentChannel
  job_title?: string
  pre_salary?: string
  post_salary?: string
  bday?: string
  city?: string
  education?: string
  graduation_cohort?: string
  enroll_date?: string
  graduation_date?: string
  phone?: string
  douyin_order?: string
  class_name?: string
  status: StudentStatus
}

const emptyToUndefined = (value: string | null | undefined): string | undefined => {
  if (value == null) return undefined
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

const toText = (value: unknown): string => {
  if (value == null) return ''
  return String(value)
}

const toStudentStatus = (value: string): StudentStatus => {
  if (value === 'graduated' || value === 'dropped') {
    return value
  }
  return 'active'
}

const toReportSummary = (value: StudentReportSummaryApiData | null | undefined, defaultPrimary: boolean = false): StudentReportSummary | null => {
  if (!value || typeof value !== 'object') return null
  return {
    id: Number(value.id),
    filename: toText(value.filename),
    title: value.title == null ? null : toText(value.title),
    fileType: toText(value.file_type),
    category: toText(value.category),
    ossKey: value.oss_key == null ? null : toText(value.oss_key),
    isPrimary: value.is_primary ?? defaultPrimary,
    createdAt: value.created_at == null ? null : toText(value.created_at),
  }
}

const toReportSummaryList = (list: StudentReportSummaryApiData[] | null | undefined): StudentReportSummary[] => {
  if (!Array.isArray(list)) return []
  return list.map(item => toReportSummary(item, false)).filter((x): x is StudentReportSummary => x !== null)
}

export const toViewStudent = (data: StudentApiData): StudentView => {
  const reportMaterials = toReportSummaryList(data.report_materials)
  const primaryReport = reportMaterials.find(r => r.isPrimary) ?? null
  // 兼容：如果 report_materials 为空但 main_report_material 存在，回退使用旧字段
  const mainReport = primaryReport ?? toReportSummary(data.main_report_material, true)

  return {
    id: data.id,
    name: toText(data.name),
    channel: data.channel === '抖音' ? '抖音' : '微信',
    jobTitle: toText(data.job_title),
    preSalary: toText(data.pre_salary),
    postSalary: data.post_salary == null ? null : toText(data.post_salary),
    bday: toText(data.bday),
    city: toText(data.city),
    education: toText(data.education),
    graduationCohort: toText(data.graduation_cohort),
    enrollDate: toText(data.enroll_date),
    graduationDate: data.graduation_date == null ? null : toText(data.graduation_date),
    phone: toText(data.phone),
    douyinOrder: toText(data.douyin_order),
    className: toText(data.class_name),
    mainReportMaterialId: mainReport?.id ?? null,
    mainReportMaterial: mainReport,
    reportMaterials: reportMaterials.length > 0 ? reportMaterials : (mainReport ? [mainReport] : []),
    status: toStudentStatus(toText(data.status)),
  }
}

export const toStudentPayload = (student: Omit<StudentView, 'id'>): StudentUpdatePayload => ({
  name: student.name.trim(),
  channel: student.channel,
  job_title: emptyToUndefined(student.jobTitle),
  pre_salary: emptyToUndefined(student.preSalary),
  post_salary: emptyToUndefined(student.postSalary),
  bday: emptyToUndefined(student.bday),
  city: emptyToUndefined(student.city),
  education: emptyToUndefined(student.education),
  graduation_cohort: emptyToUndefined(student.graduationCohort),
  enroll_date: emptyToUndefined(student.enrollDate),
  graduation_date: emptyToUndefined(student.graduationDate),
  phone: emptyToUndefined(student.phone),
  douyin_order: emptyToUndefined(student.douyinOrder),
  class_name: emptyToUndefined(student.className),
  status: student.status,
})
