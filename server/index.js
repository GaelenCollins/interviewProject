import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { runQuoteCheck, streamChat } from './services/pipeline.js'
import { MODELS } from './services/claude.js'
import { MAX_FILE_BYTES } from '../src/utils/ingestGuards.js'

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
})

function parseOriginList(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Local Vite + any Netlify / custom frontend origins from env. */
const corsAllowedOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8443',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8443',
  ...parseOriginList(process.env.CORS_ORIGINS),
  ...parseOriginList(process.env.FRONTEND_URL),
])

function isAllowedCorsOrigin(origin) {
  if (!origin) return true
  if (corsAllowedOrigins.has(origin)) return true
  try {
    const { hostname } = new URL(origin)
    // Netlify production + deploy previews (*.netlify.app)
    if (hostname === 'netlify.app' || hostname.endsWith('.netlify.app')) {
      return true
    }
  } catch {
    return false
  }
  return false
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin)) return callback(null, true)
      console.warn(`[cors] blocked origin: ${origin}`)
      return callback(null, false)
    },
  }),
)
app.use(express.json({ limit: '2mb' }))

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    models: MODELS,
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    pdfExtractor: 'pdfjs-dist',
  })
})

app.post(
  '/api/check',
  (req, res, next) => {
    upload.fields([
      { name: 'pdf', maxCount: 1 },
      { name: 'excel', maxCount: 1 },
    ])(req, res, (err) => {
      if (!err) return next()
      const wantsStream =
        String(req.query.stream || '') === '1' ||
        req.headers.accept?.includes('text/event-stream')
      const message =
        err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          ? 'File exceeds the 15MB limit. Please upload a smaller file.'
          : err.message || 'Upload failed'
      if (wantsStream) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-transform')
        res.flushHeaders?.()
        writeSse(res, 'error', { error: message })
        return res.end()
      }
      return res.status(400).json({ error: message })
    })
  },
  async (req, res) => {
    const wantsStream = String(req.query.stream || '') === '1' || req.headers.accept?.includes('text/event-stream')

    try {
      const pdf = req.files?.pdf?.[0]
      const excel = req.files?.excel?.[0]
      if (!pdf || !excel) {
        return res.status(400).json({ error: 'Both pdf and excel files are required.' })
      }

      if (wantsStream) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-transform')
        res.setHeader('Connection', 'keep-alive')
        res.flushHeaders?.()

        const result = await runQuoteCheck({
          excelBuffer: excel.buffer,
          excelFilename: excel.originalname,
          pdfBuffer: pdf.buffer,
          pdfFilename: pdf.originalname,
          onProgress: (payload) => writeSse(res, 'progress', payload),
        })

        writeSse(res, 'result', result)
        res.end()
        return
      }

      const result = await runQuoteCheck({
        excelBuffer: excel.buffer,
        excelFilename: excel.originalname,
        pdfBuffer: pdf.buffer,
        pdfFilename: pdf.originalname,
      })
      res.json(result)
    } catch (err) {
      console.error('[api/check]', err)
      const message = err.message || 'Quote check failed'
      if (wantsStream && !res.headersSent) {
        res.status(500).json({ error: message })
      } else if (wantsStream) {
        writeSse(res, 'error', { error: message })
        res.end()
      } else {
        res.status(500).json({ error: message })
      }
    }
  },
)

app.post('/api/chat', async (req, res) => {
  const wantsStream =
    String(req.query.stream || '') === '1' ||
    req.headers.accept?.includes('text/event-stream')

  try {
    const {
      sessionId,
      message,
      mode = 'chat',
      errorId = null,
      hiddenErrorIds = [],
    } = req.body || {}
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required.' })
    }

    if (!wantsStream) {
      let answer = ''
      for await (const token of streamChat({
        sessionId,
        message,
        mode,
        errorId,
        hiddenErrorIds,
      })) {
        answer += token
      }
      return res.json({ answer, mode })
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    for await (const token of streamChat({
      sessionId,
      message,
      mode,
      errorId,
      hiddenErrorIds,
    })) {
      writeSse(res, 'token', { text: token })
    }
    writeSse(res, 'done', {})
    res.end()
  } catch (err) {
    console.error('[api/chat]', err)
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Chat failed' })
    } else {
      writeSse(res, 'error', { error: err.message || 'Chat failed' })
      res.end()
    }
  }
})

const port = Number(process.env.API_PORT || process.env.PORT || 3001)
app.listen(port, () => {
  console.log(`[quote-checker-api] listening on http://localhost:${port}`)
  console.log(`[quote-checker-api] Haiku=${MODELS.HAIKU} Sonnet=${MODELS.SONNET}`)
  if (!process.env.ANTHROPIC_API_KEY) console.warn('[warn] ANTHROPIC_API_KEY missing')
  console.log('[quote-checker-api] PDF extraction: pdfjs-dist (free, digital PDFs)')
})
