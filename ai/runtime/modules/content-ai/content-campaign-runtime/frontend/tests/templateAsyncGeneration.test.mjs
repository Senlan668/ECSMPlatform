import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const apiSource = readFileSync(
  new URL('../src/api.js', import.meta.url),
  'utf8'
)
const posterPageSource = readFileSync(
  new URL('../src/PosterPage.vue', import.meta.url),
  'utf8'
)
const resultDisplaySource = readFileSync(
  new URL('../src/components/poster/ResultDisplay.vue', import.meta.url),
  'utf8'
)
const panelTemplateSource = readFileSync(
  new URL('../src/components/poster/PanelTemplate.vue', import.meta.url),
  'utf8'
)

test('single template generation submits a background template task', () => {
  const fn = apiSource.match(/export async function generateTemplatePoster[\s\S]*?\n}/)?.[0] || ''

  assert.match(fn, /\/poster\/batch\/template/)
  assert.match(fn, /items:\s*\[/)
  assert.doesNotMatch(fn, /\/poster\/generate\/template/)
  assert.match(posterPageSource, /generateWithWrapper\('template', payload\)/)
})

test('result display exposes retry for failed background generation items', () => {
  assert.match(apiSource, /export async function retryBatchTask/)
  assert.match(resultDisplaySource, /retryBatchTask/)
  assert.match(resultDisplaySource, /重试失败项/)
  assert.match(resultDisplaySource, /failed_count/)
  assert.match(resultDisplaySource, /salesImageUrl/)
  assert.match(resultDisplaySource, /total_count === 1/)
})

test('single background template task renders as one large poster instead of batch grid', () => {
  assert.match(resultDisplaySource, /isSingleBatchTask/)
  assert.match(resultDisplaySource, /singleBatchDisplayItem/)
  assert.match(resultDisplaySource, /v-else-if="isSingleBatchTask"/)
  assert.match(resultDisplaySource, /单张生成/)
  assert.match(resultDisplaySource, /max-w-lg lg:max-w-2xl/)
})

test('template panel shows the current image model provider', () => {
  assert.match(posterPageSource, /getPreferences/)
  assert.match(posterPageSource, /getImageModels/)
  assert.match(posterPageSource, /currentImageModel/)
  assert.match(posterPageSource, /:currentImageModel="currentImageModel"/)
  assert.match(panelTemplateSource, /currentImageModel/)
  assert.match(panelTemplateSource, /当前模型/)
  assert.match(panelTemplateSource, /currentImageModel\.provider/)
})
