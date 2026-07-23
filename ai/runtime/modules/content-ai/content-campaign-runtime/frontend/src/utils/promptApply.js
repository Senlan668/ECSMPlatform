export const PROMPT_APPLY_STORAGE_KEY = 'prompt_apply_payload'
export const PROMPT_APPLY_TTL_MS = 5 * 60 * 1000
export const APPLICABLE_PROMPT_CATEGORIES = Object.freeze(['poster', 'workflow'])

function isApplicableCategory(category) {
  return APPLICABLE_PROMPT_CATEGORIES.includes(category)
}

function isValidPayload(payload) {
  return Boolean(
    payload
    && typeof payload.prompt_id === 'string'
    && payload.prompt_id
    && isApplicableCategory(payload.category)
    && typeof payload.content === 'string'
    && payload.content.trim()
    && Number.isFinite(payload.created_at)
  )
}

export function savePromptApplyPayload(storage, payload) {
  if (!isValidPayload(payload)) {
    throw new Error('无效的提示词应用数据')
  }
  storage.setItem(PROMPT_APPLY_STORAGE_KEY, JSON.stringify(payload))
}

export function consumePromptApplyPayload(storage, expectedCategory, now = Date.now()) {
  const raw = storage.getItem(PROMPT_APPLY_STORAGE_KEY)
  if (!raw) return null

  storage.removeItem(PROMPT_APPLY_STORAGE_KEY)

  try {
    const payload = JSON.parse(raw)
    const isExpired = now - payload?.created_at > PROMPT_APPLY_TTL_MS
    if (!isValidPayload(payload) || payload.category !== expectedCategory || isExpired) {
      return null
    }
    return payload
  } catch (error) {
    return null
  }
}

export function clearPromptApplyPayload(storage) {
  storage.removeItem(PROMPT_APPLY_STORAGE_KEY)
}
