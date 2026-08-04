const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
).replace(/\/$/, '')

function apiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalized}`
}

function missingApiConfigMessage() {
  return (
    'API is not reachable. On Netlify, set VITE_API_BASE_URL to your Render/Railway ' +
    'API origin (e.g. https://your-backend.onrender.com). Locally the app expects ' +
    'the Express API on http://localhost:3001. Keep ANTHROPIC_API_KEY on the API host only.'
  )
}

async function assertApiResponse(res) {
  const contentType = res.headers.get('content-type') || ''
  // Netlify SPA fallback returns index.html with 200 for unknown /api routes
  if (contentType.includes('text/html')) {
    throw new Error(
      `API at ${API_BASE_URL} returned HTML instead of JSON/SSE (${res.status}). ` +
        (import.meta.env.VITE_API_BASE_URL
          ? 'Check the API URL and CORS allowlist on the backend.'
          : missingApiConfigMessage()),
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
      import.meta.env.VITE_API_BASE_URL
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

  const res = await fetch(apiUrl('/api/check?stream=1'), {
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
  const res = await fetch(apiUrl('/api/chat?stream=1'), {
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
  const res = await fetch(apiUrl('/api/health'))
  return parseJson(res)
}
