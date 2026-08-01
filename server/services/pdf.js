/**
 * Free digital PDF text extraction via pdfjs-dist.
 * Enough for ERP/quoting-system PDFs (not scanned paper).
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { MIN_PDF_TEXT_CHARS, plainPdfTextLength } from '../../src/utils/ingestGuards.js'

const PASSWORD_MSG =
  'This PDF is password-protected or encrypted. Please remove encryption before uploading.'
const SCANNED_MSG =
  'This PDF appears to be a scanned image or empty. Please upload a digital PDF exported directly from SNAP.'

export async function extractPdfText(buffer, filename = 'quote.pdf') {
  // pdfjs rejects Node Buffer; copy into a plain Uint8Array
  const data = Uint8Array.from(buffer)

  let pdf
  try {
    const loadingTask = getDocument({
      data,
      useSystemFonts: true,
      disableWorker: true,
      // Fail fast instead of prompting for a password
      password: '',
    })
    pdf = await loadingTask.promise
  } catch (err) {
    const name = err?.name || ''
    const msg = String(err?.message || err || '')
    if (
      name === 'PasswordException' ||
      /password/i.test(msg) ||
      /encrypted/i.test(msg) ||
      err?.code === 1
    ) {
      const e = new Error(PASSWORD_MSG)
      e.code = 'PDF_PASSWORD'
      throw e
    }
    const e = new Error(
      `Could not read this PDF (${msg || 'unknown error'}). Try re-exporting a digital PDF from SNAP.`,
    )
    e.code = 'PDF_READ_FAILED'
    throw e
  }

  const pages = []

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      const text = reconstructPageText(content.items)
      pages.push({
        page: pageNum,
        text,
        markdown: text,
      })
    }
  } catch (err) {
    const name = err?.name || ''
    const msg = String(err?.message || err || '')
    if (name === 'PasswordException' || /password/i.test(msg) || /encrypted/i.test(msg)) {
      const e = new Error(PASSWORD_MSG)
      e.code = 'PDF_PASSWORD'
      throw e
    }
    throw err
  }

  const markdown = pages
    .map((p) => `<!-- page ${p.page} -->\n${p.markdown}`)
    .join('\n\n---\n\n')

  const result = {
    filename,
    markdown,
    pages,
    pageCount: pdf.numPages,
    provider: 'pdfjs-dist',
  }

  if (plainPdfTextLength(result) < MIN_PDF_TEXT_CHARS) {
    const e = new Error(SCANNED_MSG)
    e.code = 'PDF_SCANNED_OR_EMPTY'
    throw e
  }

  return result
}

/** Rebuild roughly reading-order text from pdf.js text items. */
function reconstructPageText(items) {
  if (!items?.length) return ''

  let line = ''
  let lastY = null
  const lines = []

  for (const item of items) {
    const str = item.str ?? ''
    const y = Array.isArray(item.transform) ? item.transform[5] : null

    if (lastY != null && y != null && Math.abs(y - lastY) > 2) {
      if (line.trim()) lines.push(line.trim())
      line = str
    } else {
      const needsSpace =
        line &&
        str &&
        !/\s$/.test(line) &&
        !/^\s/.test(str) &&
        !/[-–—/]$/.test(line)
      line += needsSpace ? ` ${str}` : str
    }

    if (y != null) lastY = y
  }

  if (line.trim()) lines.push(line.trim())
  return lines.join('\n')
}
