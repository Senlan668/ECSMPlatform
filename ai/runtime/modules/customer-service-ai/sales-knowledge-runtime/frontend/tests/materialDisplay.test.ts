import test from 'node:test'
import assert from 'node:assert/strict'

import { getMaterialDisplayName, getMaterialUploadTime } from '../src/components/materialDisplay.ts'
import type { Material } from '../src/types'

const baseMaterial: Material = {
  id: 1,
  filename: 'Gemini_Generated_Image_6p10u36p10u36p10.png',
  stored_name: 'stored.png',
  file_size: 1024,
  file_type: 'image/png',
  category: 'report',
  title: null,
  description: null,
  tags: [],
  uploaded_by: 'admin',
  download_count: 0,
  oss_key: 'materials/report/stored.png',
  created_at: '2026-03-27T10:00:00Z',
}

test('详情标题优先显示重命名后的展示名', () => {
  const material: Material = {
    ...baseMaterial,
    title: '喜报海报-0327',
  }

  assert.equal(getMaterialDisplayName(material), '喜报海报-0327')
})

test('没有展示名时回退到原始文件名', () => {
  assert.equal(
    getMaterialDisplayName(baseMaterial),
    'Gemini_Generated_Image_6p10u36p10u36p10.png',
  )
})

test('上传时间展示为完整日期时间', () => {
  const material: Material = {
    ...baseMaterial,
    created_at: '2026-03-27T10:00:00',
  }

  assert.equal(
    getMaterialUploadTime(material),
    '2026年03月27日 10:00:00',
  )
})
