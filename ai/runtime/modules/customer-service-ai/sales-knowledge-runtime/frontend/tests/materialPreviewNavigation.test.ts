import test from 'node:test'
import assert from 'node:assert/strict'

import { getMaterialPreviewNavigation } from '../src/components/materialPreviewNavigation.ts'
import type { Material } from '../src/types.ts'

const material = (id: number, overrides: Partial<Material> = {}): Material => ({
  id,
  filename: `report-${id}.png`,
  stored_name: `report-${id}.png`,
  file_size: 1024,
  file_type: 'image/png',
  category: 'report',
  title: null,
  description: null,
  remark: null,
  tags: [],
  uploaded_by: null,
  download_count: 0,
  oss_key: `materials/report-${id}.png`,
  source_material_id: null,
  is_pre_masked: false,
  folder_id: null,
  created_at: '2026-05-11T10:00:00',
  ...overrides,
})

test('gets previous and next report image around current preview item', () => {
  const items = [
    material(1),
    material(2),
    material(3),
  ]

  const nav = getMaterialPreviewNavigation(items, 2)

  assert.equal(nav.previous?.id, 1)
  assert.equal(nav.next?.id, 3)
})

test('ignores non-report and non-image materials for preview navigation', () => {
  const items = [
    material(1),
    material(9, { category: 'course', file_type: 'application/pdf' }),
    material(10, { category: 'report', file_type: 'folder' }),
    material(2),
  ]

  const nav = getMaterialPreviewNavigation(items, 1)

  assert.equal(nav.previous, null)
  assert.equal(nav.next?.id, 2)
})

test('does not wrap around at preview navigation boundaries', () => {
  const items = [
    material(1),
    material(2),
  ]

  assert.equal(getMaterialPreviewNavigation(items, 1).previous, null)
  assert.equal(getMaterialPreviewNavigation(items, 2).next, null)
})
