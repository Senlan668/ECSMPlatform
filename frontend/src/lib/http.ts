const CORE_CONTROL_URL = import.meta.env.VITE_CORE_CONTROL_URL || 'http://localhost:8080'
const AI_BUSINESS_URL = import.meta.env.VITE_AI_BUSINESS_URL || 'http://localhost:8081'

interface ApiErrorBody {
  detail?: string
  error?: string
  code?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: ApiErrorBody = {}
    try {
      body = await response.json() as ApiErrorBody
    } catch {
      // A non-JSON response still produces a useful status-based error.
    }
    throw new ApiError(body.detail || body.error || `请求失败 (${response.status})`, response.status, body.code)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

async function assertResponse(response: Response) {
  if (response.ok) return response
  let body: ApiErrorBody = {}
  try {
    body = await response.json() as ApiErrorBody
  } catch {
    // Preserve the HTTP status when the upstream returns a binary or empty error.
  }
  throw new ApiError(body.detail || body.error || `请求失败 (${response.status})`, response.status, body.code)
}

function withJsonHeaders(init: RequestInit | undefined, extraHeaders?: HeadersInit) {
  const headers = new Headers(init?.headers)
  if (init?.body !== undefined && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  new Headers(extraHeaders).forEach((value, key) => headers.set(key, value))
  return headers
}

export async function coreRequest<T>(path: string, init?: RequestInit, accessToken?: string): Promise<T> {
  const headers = withJsonHeaders(init, accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined)
  const response = await fetch(`${CORE_CONTROL_URL}${path}`, { ...init, headers })
  return parseResponse<T>(response)
}

export async function businessRequest<T>(
  path: string,
  auth: { accessToken: string; tenantId: string },
  init?: RequestInit,
): Promise<T> {
  const headers = withJsonHeaders(init, {
    Authorization: `Bearer ${auth.accessToken}`,
    'X-Tenant-Id': auth.tenantId,
    'X-Trace-Id': crypto.randomUUID(),
  })
  const response = await fetch(`${AI_BUSINESS_URL}${path}`, { ...init, headers })
  return parseResponse<T>(response)
}

export interface BusinessDownload {
  blob: Blob
  filename: string
}

function downloadFilename(response: Response) {
  const disposition = response.headers.get('Content-Disposition') || ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try { return decodeURIComponent(encoded) } catch { return encoded }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'download'
}

export async function businessBlobRequest(
  path: string,
  auth: { accessToken: string; tenantId: string },
  init?: RequestInit,
): Promise<BusinessDownload> {
  const headers = withJsonHeaders(init, {
    Authorization: `Bearer ${auth.accessToken}`,
    'X-Tenant-Id': auth.tenantId,
    'X-Trace-Id': crypto.randomUUID(),
  })
  const response = await assertResponse(await fetch(`${AI_BUSINESS_URL}${path}`, { ...init, headers }))
  return { blob: await response.blob(), filename: downloadFilename(response) }
}

export async function businessStreamRequest(
  path: string,
  auth: { accessToken: string; tenantId: string },
  init?: RequestInit,
): Promise<Response> {
  const headers = withJsonHeaders(init, {
    Authorization: `Bearer ${auth.accessToken}`,
    'X-Tenant-Id': auth.tenantId,
    'X-Trace-Id': crypto.randomUUID(),
    Accept: 'text/event-stream',
  })
  return assertResponse(await fetch(`${AI_BUSINESS_URL}${path}`, { ...init, headers }))
}

export function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  }
}

interface SseOptions<T> {
  baseUrl?: string
  path: string
  body: unknown
  headers?: HeadersInit
  onEvent: (event: T) => void
  onError: (error: Error) => void
}

export function createSseStream<T>({ baseUrl = AI_BUSINESS_URL, path, body, headers, onEvent, onError }: SseOptions<T>) {
  const controller = new AbortController()
  fetch(`${baseUrl}${path}`, {
    ...jsonRequest('POST', body),
    headers: withJsonHeaders(jsonRequest('POST', body), headers),
    signal: controller.signal,
  }).then(async response => {
    if (!response.ok) throw new ApiError(`流式请求失败 (${response.status})`, response.status)
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
          // Ignore malformed events without terminating later events.
        }
      }
    }
  }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') return
    onError(error instanceof Error ? error : new Error('流式请求失败'))
  })
  return controller
}
