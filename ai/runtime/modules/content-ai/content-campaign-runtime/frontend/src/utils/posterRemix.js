const REMIX_STORAGE_KEY = 'poster_remix_work'

function normalizeMode(item) {
  return item?.source_mode || item?.mode || 'custom'
}

function hasTemplateParams(item) {
  return Boolean(
    item?.template_id
    && item?.params
    && typeof item.params === 'object'
    && !Array.isArray(item.params)
  )
}

export function buildPosterRemixPayload(item) {
  const sourceMode = normalizeMode(item)
  const base = {
    source_work_id: item?.id || null,
    source_mode: sourceMode,
    title: item?.title || '',
    aspect_ratio: item?.aspect_ratio || '3:4',
    prompt: item?.prompt || '',
    ai_prompt_used: item?.ai_prompt_used || '',
    created_at: Date.now(),
  }

  if (sourceMode === 'template' && hasTemplateParams(item)) {
    return {
      ...base,
      target_tab: 'template',
      template_id: item.template_id,
      params: { ...item.params },
    }
  }

  return {
    ...base,
    target_tab: 'custom',
    prompt: item?.prompt || item?.ai_prompt_used || item?.title || '',
    style_tags: Array.isArray(item?.style_tags) ? [...item.style_tags] : [],
  }
}

export function savePosterRemixPayload(storage, payload) {
  storage.setItem(REMIX_STORAGE_KEY, JSON.stringify(payload))
}

export function consumePosterRemixPayload(storage) {
  const raw = storage.getItem(REMIX_STORAGE_KEY)
  if (!raw) return null
  storage.removeItem(REMIX_STORAGE_KEY)
  try {
    return JSON.parse(raw)
  } catch (error) {
    return null
  }
}

export function resolvePosterRemixTarget(payload, templates = []) {
  if (!payload) return null
  if (payload.target_tab === 'template') {
    const matchedTemplate = templates.find(tpl => tpl.id === payload.template_id)
    if (matchedTemplate) {
      return {
        tab: 'template',
        prefill: {
          ...payload,
          mode: 'template',
          remix_key: `${payload.source_work_id || 'unknown'}:${payload.created_at || Date.now()}`,
        },
      }
    }
  }

  return {
    tab: 'custom',
    prefill: {
      mode: 'custom',
      remix_key: `${payload.source_work_id || 'unknown'}:${payload.created_at || Date.now()}`,
      source_work_id: payload.source_work_id || null,
      prompt: payload.prompt || payload.ai_prompt_used || payload.title || '',
      selected_styles: Array.isArray(payload.style_tags) ? payload.style_tags : [],
      aspect_ratio: payload.aspect_ratio || '3:4',
      color_tone: '',
    },
  }
}

export { REMIX_STORAGE_KEY }
