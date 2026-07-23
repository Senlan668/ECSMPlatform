import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const templateCenterSource = readFileSync(
  new URL('../src/TemplateCenterPage.vue', import.meta.url),
  'utf8',
)
const templatePreviewSource = readFileSync(
  new URL('../src/components/template/TemplatePreview.vue', import.meta.url),
  'utf8',
)
const apiSource = readFileSync(
  new URL('../src/api.js', import.meta.url),
  'utf8',
)

test('template center only exposes public template moderation to admins', () => {
  assert.match(templateCenterSource, /getCurrentUser/)
  assert.match(templateCenterSource, /canManagePublicTemplates/)
  assert.match(templateCenterSource, /handleDeactivatePublicTemplate/)
  assert.match(templateCenterSource, /handleRestorePublicTemplate/)
  assert.match(templatePreviewSource, /canManagePublic/)
  assert.match(templatePreviewSource, /下架/)
  assert.match(templatePreviewSource, /恢复/)
})

test('frontend api exposes public template deactivate and restore endpoints', () => {
  assert.match(apiSource, /deactivatePublicTemplate/)
  assert.match(apiSource, /restorePublicTemplate/)
  assert.match(apiSource, /api\.post\(`\/templates\/\$\{id\}\/deactivate`\)/)
  assert.match(apiSource, /api\.post\(`\/templates\/\$\{id\}\/restore`\)/)
})
