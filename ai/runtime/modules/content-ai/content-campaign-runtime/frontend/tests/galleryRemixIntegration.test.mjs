import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('gallery remix button stores payload and navigates to poster page instead of showing placeholder', async () => {
  const source = await readFile(
    new URL('../src/GalleryPage.vue', import.meta.url),
    'utf8',
  )

  assert.match(source, /savePosterRemixPayload/)
  assert.match(source, /router\.push\(\{\s*name:\s*'poster'/s)
  assert.doesNotMatch(source, /即将支持/)
})

test('poster page consumes remix payload and passes prefill into active panel', async () => {
  const source = await readFile(
    new URL('../src/PosterPage.vue', import.meta.url),
    'utf8',
  )

  assert.match(source, /consumePosterRemixPayload/)
  assert.match(source, /resolvePosterRemixTarget/)
  assert.match(source, /:prefill="panelPrefill"/)
})
