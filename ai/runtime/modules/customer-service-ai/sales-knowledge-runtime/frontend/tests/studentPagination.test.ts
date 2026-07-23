import test from 'node:test'
import assert from 'node:assert/strict'

import { getStudentPageState } from '../src/components/studentPagination.ts'

const items = Array.from({ length: 21 }, (_, index) => ({ id: index + 1 }))

test('student pagination shows ten rows per page', () => {
  const page = getStudentPageState(items, 1, 10)

  assert.equal(page.totalPages, 3)
  assert.equal(page.items.length, 10)
  assert.equal(page.items[0].id, 1)
  assert.equal(page.items[9].id, 10)
  assert.equal(page.startIndex, 1)
  assert.equal(page.endIndex, 10)
})

test('student pagination shows remaining rows on the last page', () => {
  const page = getStudentPageState(items, 3, 10)

  assert.equal(page.items.length, 1)
  assert.equal(page.items[0].id, 21)
  assert.equal(page.startIndex, 21)
  assert.equal(page.endIndex, 21)
})

test('student pagination clamps out-of-range page after filters change', () => {
  const page = getStudentPageState(items.slice(0, 12), 5, 10)

  assert.equal(page.currentPage, 2)
  assert.equal(page.totalPages, 2)
  assert.equal(page.items.length, 2)
})

test('student pagination reports empty state without fake ranges', () => {
  const page = getStudentPageState([], 1, 10)

  assert.equal(page.currentPage, 1)
  assert.equal(page.totalPages, 1)
  assert.equal(page.startIndex, 0)
  assert.equal(page.endIndex, 0)
  assert.deepEqual(page.items, [])
})
