import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('gallery page defaults to owned works and sends the scope explicitly', () => {
  const source = readFileSync('frontend/src/GalleryPage.vue', 'utf8')

  assert.match(source, /only_mine:\s*true/)
  assert.match(source, /only_mine:\s*currentFilters\.only_mine/)
  assert.doesNotMatch(source, /if \(currentFilters\.only_mine\) params\.only_mine = true/)
})

test('gallery filter defaults to the parent scope without falling back to all works', () => {
  const source = readFileSync('frontend/src/components/gallery/GalleryFilter.vue', 'utf8')

  assert.match(source, /only_mine:\s*props\.filters\.only_mine \?\? true/)
})
