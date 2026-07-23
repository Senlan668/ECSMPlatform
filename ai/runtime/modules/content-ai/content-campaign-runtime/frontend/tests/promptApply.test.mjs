import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  PROMPT_APPLY_STORAGE_KEY,
  clearPromptApplyPayload,
  consumePromptApplyPayload,
  savePromptApplyPayload,
} from '../src/utils/promptApply.js'

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
}

test('prompt apply payload is consumed once for the matching category', () => {
  const storage = createMemoryStorage()
  savePromptApplyPayload(storage, {
    prompt_id: 'prompt-1',
    category: 'poster',
    content: '生成春日海报',
    created_at: 1000,
  })

  assert.deepEqual(consumePromptApplyPayload(storage, 'poster', 1000), {
    prompt_id: 'prompt-1',
    category: 'poster',
    content: '生成春日海报',
    created_at: 1000,
  })
  assert.equal(consumePromptApplyPayload(storage, 'poster', 1000), null)
})

test('prompt apply payload is discarded when the category does not match', () => {
  const storage = createMemoryStorage()
  savePromptApplyPayload(storage, {
    prompt_id: 'prompt-2',
    category: 'workflow',
    content: 'AI 教育趋势',
    created_at: 1000,
  })

  assert.equal(consumePromptApplyPayload(storage, 'poster', 1000), null)
  assert.equal(storage.getItem(PROMPT_APPLY_STORAGE_KEY), null)
})

test('prompt apply payload rejects unknown categories and blank content', () => {
  const storage = createMemoryStorage()

  assert.throws(() => savePromptApplyPayload(storage, {
    prompt_id: 'prompt-3',
    category: 'other',
    content: '其他内容',
    created_at: 1000,
  }))
  assert.throws(() => savePromptApplyPayload(storage, {
    prompt_id: 'prompt-4',
    category: 'poster',
    content: '   ',
    created_at: 1000,
  }))
})

test('prompt apply payload discards malformed and expired data', () => {
  const storage = createMemoryStorage()
  storage.setItem(PROMPT_APPLY_STORAGE_KEY, '{invalid')
  assert.equal(consumePromptApplyPayload(storage, 'poster', 1000), null)

  savePromptApplyPayload(storage, {
    prompt_id: 'prompt-5',
    category: 'poster',
    content: '过期海报',
    created_at: 1000,
  })
  assert.equal(consumePromptApplyPayload(storage, 'poster', 301001), null)
})

test('storage write failures are exposed to the caller', () => {
  const storage = {
    setItem() {
      throw new Error('storage disabled')
    },
  }

  assert.throws(() => savePromptApplyPayload(storage, {
    prompt_id: 'prompt-6',
    category: 'poster',
    content: '无法保存',
    created_at: 1000,
  }), /storage disabled/)
})

test('prompt apply payload can be cleared after a failed navigation', () => {
  const storage = createMemoryStorage()
  savePromptApplyPayload(storage, {
    prompt_id: 'prompt-7',
    category: 'poster',
    content: '待清理',
    created_at: 1000,
  })

  clearPromptApplyPayload(storage)

  assert.equal(storage.getItem(PROMPT_APPLY_STORAGE_KEY), null)
})

test('prompt cards only expose apply for supported categories and show pending state', async () => {
  const source = await readFile(
    new URL('../src/components/prompt/PromptCard.vue', import.meta.url),
    'utf8',
  )

  assert.match(source, /APPLICABLE_PROMPT_CATEGORIES/)
  assert.match(source, /v-if="canApply"/)
  assert.match(source, /applying:\s*Boolean/)
  assert.match(source, /applyDisabled:\s*Boolean/)
  assert.match(source, /应用中/)
  assert.match(source, /:disabled="applying \|\| applyDisabled"/)
})

test('prompt library binds apply state and routes supported categories', async () => {
  const source = await readFile(
    new URL('../src/PromptLibraryPage.vue', import.meta.url),
    'utf8',
  )

  assert.match(source, /@use="handleApply"/)
  assert.match(source, /:applying="applyingPromptId === prompt\.id"/)
  assert.match(source, /:apply-disabled="Boolean\(applyingPromptId\)"/)
  assert.match(source, /useRouter/)
  assert.match(source, /isNavigationFailure/)
  assert.match(source, /savePromptApplyPayload/)
  assert.match(source, /clearPromptApplyPayload/)
  assert.match(source, /usePrompt/)
  assert.match(source, /name:\s*'poster'/)
  assert.match(source, /tab:\s*'custom'/)
  assert.match(source, /name:\s*'workflow'/)
  assert.match(source, /提示词内容为空/)
  assert.match(source, /void usePrompt\(prompt\.id\)/)
})

test('poster page consumes a prompt application without starting generation', async () => {
  const source = await readFile(
    new URL('../src/PosterPage.vue', import.meta.url),
    'utf8',
  )
  const helper = source.match(/function consumePromptApplication\(\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /consumePromptApplyPayload/)
  assert.match(source, /consumePromptApplication\(\)/)
  assert.match(helper, /consumePromptApplyPayload\(sessionStorage, 'poster'\)/)
  assert.match(helper, /activeTab\.value = 'custom'/)
  assert.match(helper, /generatedResult\.value = null/)
  assert.match(helper, /mode: 'custom'/)
  assert.match(helper, /prompt: payload\.content/)
  assert.doesNotMatch(helper, /handleGenerate|generateCustomPoster|apiMethodMap/)
})

test('workflow page consumes a prompt application without starting workflow', async () => {
  const source = await readFile(
    new URL('../src/WorkflowPage.vue', import.meta.url),
    'utf8',
  )
  const helper = source.match(/function consumePromptApplication\(\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /consumePromptApplyPayload/)
  assert.match(source, /consumePromptApplication\(\)/)
  assert.match(helper, /consumePromptApplyPayload\(sessionStorage, 'workflow'\)/)
  assert.match(helper, /resetWorkflow\(\)/)
  assert.match(helper, /currentStep\.value = 0/)
  assert.match(helper, /topicDirection\.value = payload\.content/)
  assert.doesNotMatch(helper, /handleStart|startWithParams|streamStartWorkflow/)
})
