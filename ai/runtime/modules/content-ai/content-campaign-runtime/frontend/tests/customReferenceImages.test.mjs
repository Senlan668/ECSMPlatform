import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const panelCustomSource = readFileSync(
  new URL('../src/components/poster/PanelCustom.vue', import.meta.url),
  'utf8',
)
const posterPageSource = readFileSync(
  new URL('../src/PosterPage.vue', import.meta.url),
  'utf8',
)
const apiSource = readFileSync(
  new URL('../src/api.js', import.meta.url),
  'utf8',
)

test('custom generation supports unbounded multiple reference images', () => {
  assert.match(panelCustomSource, /参考图片/)
  assert.match(panelCustomSource, /multiple/)
  assert.match(panelCustomSource, /referenceImages/)
  assert.match(panelCustomSource, /processReferenceFiles/)
  assert.match(panelCustomSource, /不会限制上传张数/)
  assert.doesNotMatch(panelCustomSource, /MAX_REFERENCE_IMAGES/)
})

test('custom generation sends reference_images to backend api', () => {
  assert.match(posterPageSource, /reference_images:\s*form\.referenceImages/)
  assert.match(apiSource, /reference_images\?/)
})
