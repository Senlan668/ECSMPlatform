import test from 'node:test'
import assert from 'node:assert/strict'

import { getStudentModalFieldLabels } from '../src/components/studentManagementFields.ts'

test('student modal does not render birth date field', () => {
  const labels = getStudentModalFieldLabels()

  assert.ok(labels.includes('毕业年份 / 毕业届'))
  assert.ok(!labels.includes('出生日期'))
})
