import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMaterialMoveSuccessState,
  canDragMaterialMove,
  getMoveTarget,
  removeMovedMaterialFromCurrentView,
} from '../src/components/materialFolderMove.ts'
import type { Material } from '../src/types'

test('search mode disables drag move', () => {
  assert.equal(canDragMaterialMove('关键词'), false)
  assert.equal(canDragMaterialMove('   '), true)
})

test('getMoveTarget rejects same folder moves', () => {
  assert.equal(
    getMoveTarget({ currentFolderId: 12, targetFolderId: 12, searchQuery: '' }),
    null,
  )
})

test('getMoveTarget returns folder move payload', () => {
  assert.deepEqual(
    getMoveTarget({ currentFolderId: null, targetFolderId: 18, searchQuery: '' }),
    { folder_id: 18, successMessage: '已移动到文件夹' },
  )
})

test('getMoveTarget returns root move payload', () => {
  assert.deepEqual(
    getMoveTarget({ currentFolderId: 8, targetFolderId: null, searchQuery: '' }),
    { folder_id: null, successMessage: '已移回根目录' },
  )
})

test('getMoveTarget returns null when search is active', () => {
  assert.equal(
    getMoveTarget({ currentFolderId: 8, targetFolderId: null, searchQuery: '查询中' }),
    null,
  )
})

test('removeMovedMaterialFromCurrentView removes moved item from list', () => {
  const materials = [
    { id: 1, folder_id: 8 },
    { id: 2, folder_id: 8 },
  ] as Material[]

  const result = removeMovedMaterialFromCurrentView(materials, 1)

  assert.deepEqual(result, [{ id: 2, folder_id: 8 }])
})

test('buildMaterialMoveSuccessState clears drag markers after move', () => {
  const materials = [
    { id: 1, folder_id: 8 },
    { id: 2, folder_id: 8 },
  ] as Material[]

  const result = buildMaterialMoveSuccessState(materials, 1)

  assert.deepEqual(result, {
    materials: [{ id: 2, folder_id: 8 }],
    draggingMaterialId: null,
    dropFolderId: null,
    dropOnRoot: false,
  })
})
