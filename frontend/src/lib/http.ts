const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'


export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, init)
  if (!response.ok) {
    let detail = `${response.status}`
    try {
      const body = await response.json() as { detail?: string }
      detail = body.detail || detail
    } catch {
      // Non-JSON errors fall back to the HTTP status.
    }
    throw new Error(detail)
  }
  return response.json() as Promise<T>
}


export function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }
}


interface SseOptions<T> {
  path: string
  body: unknown
  onEvent: (event: T) => void
  onError: (error: Error) => void
}


export function createSseStream<T>({ path, body, onEvent, onError }: SseOptions<T>) {
  const controller = new AbortController()
  fetch(`${BACKEND_URL}${path}`, {
    ...jsonRequest('POST', body),
    signal: controller.signal,
  }).then(async response => {
    if (!response.ok) {
      let detail = `${response.status}`
      try {
        const payload = await response.json() as { detail?: string }
        detail = payload.detail || detail
      } catch {
        // Keep the status when the server did not return JSON.
      }
      throw new Error(detail)
    }
    if (!response.body) throw new Error('服务器未返回响应流')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          onEvent(JSON.parse(line.slice(6)) as T)
        } catch {
          // A malformed event should not terminate the remaining stream.
        }
      }
    }
  }).catch(error => {
    if (error.name !== 'AbortError') onError(error)
  })
  return controller
}
