import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = readFileSync(
  new URL('../src/components/poster/PanelTemplate.vue', import.meta.url),
  'utf8'
)

test('template panel exposes local batch generation controls', () => {
  assert.match(source, /批量生产/)
  assert.match(source, /handleBatchGenerate/)
  assert.match(source, /batchQueue/)
  assert.match(source, /batchResults/)
})

test('template batch generation clears text params and uses backend queue APIs', () => {
  assert.match(source, /createTemplateBatchTask/)
  assert.match(source, /appendTemplateBatchItems/)
  assert.match(source, /getBatchStatus/)
  assert.match(source, /clearTextParams/)
  assert.match(source, /startBatchPolling/)
  assert.match(source, /form\.value\.params/)
})
