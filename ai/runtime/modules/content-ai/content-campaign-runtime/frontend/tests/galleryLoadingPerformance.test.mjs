import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('gallery cards render thumbnails instead of downloading full images in the grid', () => {
  const source = readSource('../src/components/gallery/GalleryCard.vue')

  assert.match(source, /:src="item\.thumbnail_url \|\| item\.image_url"/)
  assert.match(source, /decoding="async"/)
})

test('template center loads the visible personal scope first and lazily fetches public templates', () => {
  const source = readSource('../src/TemplateCenterPage.vue')

  assert.doesNotMatch(source, /getTemplatesList\(\{\s*scope:\s*'all'\s*\}\)/)
  assert.match(source, /loadTemplates\('mine'\)/)
  assert.match(source, /loadTemplates\(tabId\)/)
  assert.match(source, /loadedScopes/)
})

test('template preview images do not eagerly block first content rendering', () => {
  const source = readSource('../src/components/template/TemplatePreview.vue')

  assert.match(source, /loading="lazy"/)
  assert.match(source, /decoding="async"/)
})
