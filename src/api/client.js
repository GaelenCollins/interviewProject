/**
 * - Local Vite (`import.meta.env.DEV`): empty base → `/api/*` via Vite proxy → Express :3001
 * - Netlify / production: set VITE_API_BASE_URL=https://interviewprojectapi.onrender.com
 */
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').replace(
  /\/$/,
  '',
)

function apiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalized}`
}

function missingApiConfigMessage() {
  if (import.meta.env.DEV) {
    return (
      'Cannot reach the local API. Run `pnpm dev` (or `pnpm dev:api`) so Express is ' +
      'listening on http://localhost:3001, and keep the Vite app on :8443.'
    )
  }
  return (
    'API is not reachable. On Netlify, set VITE_API_BASE_URL to your Render API ' +
    'origin (e.g. https://interviewprojectapi.onrender.com) and redeploy. ' +
    'Keep ANTHROPIC_API_KEY on Render only.'
  )
}

async function fetchApi(path, init) {
  try {
    return await fetch(apiUrl(path), init)
  } catch {
    throw new Error(missingApiConfigMessage())
  }
}

async function assertApiResponse(res) {
  const contentType = res.headers.get('content-type') || ''
  // Netlify SPA fallback returns index.html with 200 for unknown /api routes
  if (contentType.includes('text/html')) {
    throw new Error(
      API_BASE_URL
        ? `API at ${API_BASE_URL} returned HTML instead of JSON/SSE (${res.status}). Check the API URL and CORS.`
        : missingApiConfigMessage(),
    )
  }
  return res
}

async function parseJson(res) {
  await assertApiResponse(res)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data
}

async function readSse(res, handlers) {
  await assertApiResponse(res)

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Request failed (${res.status})`)
  }

  if (!res.body) {
    throw new Error(
      API_BASE_URL
        ? 'API stream body was empty. Check that the API supports SSE.'
        : missingApiConfigMessage(),
    )
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let sep
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)

      let event = 'message'
      const dataLines = []
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (!dataLines.length) continue
      const data = JSON.parse(dataLines.join('\n'))
      await handlers[event]?.(data)
      await handlers.any?.({ event, data })
    }
  }
}

export async function runCheckStream({ pdfFile, excelFile, onProgress, onResult }) {
  const form = new FormData()
  form.append('pdf', pdfFile)
  form.append('excel', excelFile)

  const res = await fetchApi('/api/check?stream=1', {
    method: 'POST',
    body: form,
    headers: { Accept: 'text/event-stream' },
  })

  let result = null
  let error = null

  await readSse(res, {
    progress: (data) => onProgress?.(data),
    result: (data) => {
      result = data
      onResult?.(data)
    },
    error: (data) => {
      error = data.error || 'Quote check failed'
    },
  })

  if (error) throw new Error(error)
  if (!result) throw new Error('Check finished without a result')
  return result
}

export async function sendChatStream({
  sessionId,
  message,
  mode = 'chat',
  errorId = null,
  hiddenErrorIds = [],
  onToken,
}) {
  const res = await fetchApi('/api/chat?stream=1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ sessionId, message, mode, errorId, hiddenErrorIds }),
  })

  let answer = ''
  let error = null

  await readSse(res, {
    token: (data) => {
      answer += data.text || ''
      onToken?.(data.text || '', answer)
    },
    error: (data) => {
      error = data.error || 'Chat failed'
    },
  })

  if (error) throw new Error(error)
  return { answer, mode }
}

/** Stream an LLM email draft (subject + body) for the current check session. */
export async function streamEmailDraft({
  sessionId,
  hiddenErrorIds = [],
  onToken,
}) {
  return sendChatStream({
    sessionId,
    message: 'Draft outbound email',
    mode: 'email',
    hiddenErrorIds,
    onToken,
  })
}

export async function getHealth() {
  const res = await fetchApi('/api/health')
  return parseJson(res)
}
