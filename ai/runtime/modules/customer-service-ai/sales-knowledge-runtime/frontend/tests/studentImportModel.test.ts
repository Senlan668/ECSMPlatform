import test from 'node:test'
import assert from 'node:assert/strict'

import { getImportPayloads, toImportedStudentDraft } from '../src/components/studentImportModel.ts'

test('toImportedStudentDraft maps AI import result to editable student draft', () => {
  const draft = toImportedStudentDraft({
    name: '张三',
    channel: '抖音',
    phone: '13800138000',
    douyin_order: 'DY001',
    class_name: '销售特训一期',
    job_title: '销售代表',
    enroll_date: '2026-05-01',
  })

  assert.equal(draft.name, '张三')
  assert.equal(draft.channel, '抖音')
  assert.equal(draft.phone, '13800138000')
  assert.equal(draft.douyinOrder, 'DY001')
  assert.equal(draft.className, '销售特训一期')
  assert.equal(draft.jobTitle, '销售代表')
  assert.equal(draft.enrollDate, '2026-05-01')
  assert.equal(draft.status, 'active')
})

test('getImportPayloads drops empty rows and trims values', () => {
  const payloads = getImportPayloads([
    toImportedStudentDraft({
      name: '  李四  ',
      phone: ' 13900001111 ',
      class_name: ' 五期 ',
    }),
    toImportedStudentDraft({
      name: '',
      phone: '',
    }),
  ])

  assert.equal(payloads.length, 1)
  assert.equal(payloads[0]?.name, '李四')
  assert.equal(payloads[0]?.phone, '13900001111')
  assert.equal(payloads[0]?.class_name, '五期')
  assert.equal(payloads[0]?.status, 'active')
})
