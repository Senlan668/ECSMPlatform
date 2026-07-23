import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = readFileSync(
  new URL('../src/components/profile/PreferenceForm.vue', import.meta.url),
  'utf8'
)

test('public image model form is managed in a dialog', () => {
  assert.match(source, /@click="openCreateModelDialog"/)
  assert.match(source, /@click="openEditModelDialog\(model\)"/)
  assert.match(source, /v-if="showModelDialog"/)
  assert.match(source, /class="model-dialog"/)
  assert.match(source, /@click="closeModelDialog"/)
})

test('legacy personal Gemini API key setting is removed', () => {
  assert.doesNotMatch(source, /custom_api_key/)
  assert.doesNotMatch(source, /个人 Gemini API Key/)
  assert.doesNotMatch(source, /旧版个人 Key/)
})
