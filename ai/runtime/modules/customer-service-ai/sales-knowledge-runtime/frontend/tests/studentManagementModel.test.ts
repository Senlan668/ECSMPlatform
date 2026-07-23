import test from 'node:test'
import assert from 'node:assert/strict'

import { toStudentPayload, toViewStudent } from '../src/components/studentManagementModel.ts'

test('toViewStudent maps API fields to view fields', () => {
  const view = toViewStudent({
    id: 12,
    name: '王五',
    channel: '微信',
    job_title: '销售',
    pre_salary: '5k',
    post_salary: null,
    bday: '1999-01-01',
    enroll_date: '2025-10-01',
    graduation_date: null,
    city: '杭州',
    education: '本科',
    graduation_cohort: '2022届',
    phone: '13800138000',
    douyin_order: 'DY001',
    class_name: '销售一期',
    main_report_material_id: 88,
    main_report_material: {
      id: 88,
      filename: 'report.png',
      title: '喜报图',
      file_type: 'image/png',
      category: 'report',
      oss_key: 'materials/report/report.png',
      created_at: '2026-05-06T10:00:00',
    },
    status: 'active',
  })

  assert.equal(view.id, 12)
  assert.equal(view.jobTitle, '销售')
  assert.equal(view.enrollDate, '2025-10-01')
  assert.equal(view.className, '销售一期')
  assert.equal(view.city, '杭州')
  assert.equal(view.education, '本科')
  assert.equal(view.graduationCohort, '2022届')
  assert.equal(view.mainReportMaterialId, 88)
  assert.equal(view.mainReportMaterial?.filename, 'report.png')
})

test('toViewStudent preserves dropped student status', () => {
  const view = toViewStudent({
    id: 13,
    name: '赵六',
    channel: '微信',
    job_title: null,
    pre_salary: null,
    post_salary: null,
    bday: null,
    enroll_date: null,
    graduation_date: null,
    city: null,
    education: null,
    graduation_cohort: null,
    phone: null,
    douyin_order: null,
    class_name: null,
    main_report_material_id: null,
    main_report_material: null,
    status: 'dropped',
  })

  assert.equal(view.status, 'dropped')
})

test('toStudentPayload trims and drops empty optional fields', () => {
  const payload = toStudentPayload({
    name: '  李四  ',
    channel: '抖音',
    jobTitle: '',
    preSalary: ' 8k ',
    postSalary: '',
    bday: '',
    enrollDate: '2025-10-01',
    graduationDate: '',
    city: ' 杭州 ',
    education: '',
    graduationCohort: ' 2022届 ',
    phone: ' 13900001111 ',
    douyinOrder: '',
    className: ' 高阶班 ',
    status: 'graduated',
  })

  assert.equal(payload.name, '李四')
  assert.equal(payload.channel, '抖音')
  assert.equal(payload.pre_salary, '8k')
  assert.equal(payload.city, '杭州')
  assert.equal(payload.graduation_cohort, '2022届')
  assert.equal(payload.phone, '13900001111')
  assert.equal(payload.class_name, '高阶班')
  assert.equal(payload.job_title, undefined)
  assert.equal(payload.education, undefined)
  assert.equal(payload.post_salary, undefined)
  assert.equal(payload.douyin_order, undefined)
})

test('toViewStudent tolerates non-string runtime values', () => {
  const view = toViewStudent({
    id: 99,
    name: 123 as any,
    channel: '微信',
    job_title: null,
    pre_salary: null,
    post_salary: null,
    bday: null,
    enroll_date: null,
    graduation_date: null,
    city: null,
    education: null,
    graduation_cohort: null,
    phone: 13800138000 as any,
    douyin_order: null,
    class_name: null,
    main_report_material_id: null,
    main_report_material: null,
    status: 'active',
  })

  assert.equal(view.name, '123')
  assert.equal(view.city, '')
  assert.equal(view.phone, '13800138000')
})
