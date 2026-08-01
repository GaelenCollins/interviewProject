/**
 * Free digital PDF text extraction via pdfjs-dist.
 * Enough for ERP/quoting-system PDFs (not scanned paper).
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

export async function extractPdfText(buffer, filename = 'quote.pdf') {
  // pdfjs rejects Node Buffer; copy into a plain Uint8Array
  const data = Uint8Array.from(buffer)
  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
    disableWorker: true,
  })
  const pdf = await loadingTask.promise
  const pages = []

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

  const markdown = pages
    .map((p) => `<!-- page ${p.page} -->\n${p.markdown}`)
    .join('\n\n---\n\n')

  return {
    filename,
    markdown,
    pages,
    pageCount: pdf.numPages,
    provider: 'pdfjs-dist',
  }
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
