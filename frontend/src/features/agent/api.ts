import type { AgentReference, AgentStreamEvent } from './types'

function parseEvent(raw: string): AgentStreamEvent | null {
  const data = raw
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
  if (!data || data === '[DONE]') return null
  try {
    return JSON.parse(data) as AgentStreamEvent
  } catch {
    return { type: 'text', content: data }
  }
}

export async function consumeAgentStream(
  response: Response,
  onEvent: (event: AgentStreamEvent) => void,
) {
  if (!response.body) throw new Error('Agent 运行时未返回响应流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    blocks.forEach(block => {
      const event = parseEvent(block)
      if (event) onEvent(event)
    })
    if (done) break
  }
  if (buffer.trim()) {
    const event = parseEvent(buffer)
    if (event) onEvent(event)
  }
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

export function eventText(value: unknown) {
  const parsed = parseJsonValue(value)
  if (typeof parsed === 'string') return parsed
  if (parsed == null) return ''
  return JSON.stringify(parsed)
}

export function eventRecommendations(value: unknown) {
  const parsed = parseJsonValue(value)
  if (!Array.isArray(parsed)) return []
  return parsed.filter(item => typeof item === 'string').slice(0, 5) as string[]
}

export function eventReferences(value: unknown): AgentReference[] {
  const parsed = parseJsonValue(value)
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const source = item as Record<string, unknown>
    const url = typeof source.url === 'string' ? source.url : typeof source.link === 'string' ? source.link : ''
    if (!url) return []
    return [{
      title: typeof source.title === 'string' && source.title ? source.title : url,
      url,
      snippet: typeof source.content === 'string'
        ? source.content
        : typeof source.snippet === 'string' ? source.snippet : undefined,
    }]
  }).slice(0, 12)
}
