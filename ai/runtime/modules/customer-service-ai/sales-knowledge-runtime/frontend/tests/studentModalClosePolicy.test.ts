import test from 'node:test'
import assert from 'node:assert/strict'

import { canCloseStudentModal } from '../src/components/studentModalClosePolicy.ts'

test('only header close can dismiss student modal when not busy', () => {
  assert.equal(canCloseStudentModal('header', false), true)
  assert.equal(canCloseStudentModal('backdrop', false), false)
})

test('student modal cannot close from any source while busy', () => {
  assert.equal(canCloseStudentModal('header', true), false)
  assert.equal(canCloseStudentModal('backdrop', true), false)
})
