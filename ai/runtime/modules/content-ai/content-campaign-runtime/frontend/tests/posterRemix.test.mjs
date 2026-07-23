import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPosterRemixPayload,
  consumePosterRemixPayload,
  resolvePosterRemixTarget,
  savePosterRemixPayload,
} from '../src/utils/posterRemix.js'

test('template works are routed to template tab with original params', () => {
  const payload = buildPosterRemixPayload({
    id: 'work-1',
    mode: 'template',
    template_id: 'tpl-1',
    params: { title: '10届专科', city: '杭州' },
    prompt: '10届专科',
    aspect_ratio: '3:4',
  })

  assert.equal(payload.target_tab, 'template')
  assert.equal(payload.template_id, 'tpl-1')
  assert.deepEqual(payload.params, { title: '10届专科', city: '杭州' })

  const target = resolvePosterRemixTarget(payload, [{ id: 'tpl-1' }])
  assert.equal(target.tab, 'template')
  assert.equal(target.prefill.params.title, '10届专科')
})

test('template works fall back to custom tab when template no longer exists', () => {
  const payload = buildPosterRemixPayload({
    id: 'work-2',
    mode: 'template',
    template_id: 'missing-template',
    params: { title: '已删除模板' },
    prompt: '已删除模板',
    ai_prompt_used: 'fallback ai prompt',
    aspect_ratio: '9:16',
  })

  const target = resolvePosterRemixTarget(payload, [])
  assert.equal(target.tab, 'custom')
  assert.equal(target.prefill.prompt, '已删除模板')
  assert.equal(target.prefill.aspect_ratio, '9:16')
})

test('custom works are routed to custom tab with prompt and style tags', () => {
  const payload = buildPosterRemixPayload({
    id: 'work-3',
    mode: 'custom',
    prompt: '春日海报',
    style_tags: ['清新', '简约'],
    aspect_ratio: '1:1',
  })

  assert.equal(payload.target_tab, 'custom')
  assert.equal(payload.prompt, '春日海报')
  assert.deepEqual(payload.style_tags, ['清新', '简约'])
})

test('remix payload can be saved and consumed once', () => {
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }

  savePosterRemixPayload(storage, { target_tab: 'custom', prompt: '测试' })

  assert.deepEqual(consumePosterRemixPayload(storage), {
    target_tab: 'custom',
    prompt: '测试',
  })
  assert.equal(consumePosterRemixPayload(storage), null)
})
