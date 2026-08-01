/**
 * Find highlight rectangles for search terms inside a rendered react-pdf page.
 * Works against the text layer DOM (spans may be character- or word-split).
 */

function textLayer(pageEl) {
  return (
    pageEl?.querySelector('.react-pdf__Page__textContent') ||
    pageEl?.querySelector('.textLayer')
  )
}

function buildCharMap(layer) {
  const spans = [...layer.querySelectorAll('span')].filter(
    (s) => (s.textContent || '').length > 0,
  )
  let full = ''
  const map = []
  for (const span of spans) {
    const t = span.textContent || ''
    for (let i = 0; i < t.length; i++) {
      full += t[i]
      map.push(span)
    }
  }
  return { full, map }
}

function rectsForRange(pageEl, map, start, length) {
  const pageRect = pageEl.getBoundingClientRect()
  const spans = new Set()
  for (let i = start; i < start + length && i < map.length; i++) {
    spans.add(map[i])
  }

  const boxes = []
  for (const span of spans) {
    const r = span.getBoundingClientRect()
    if (r.width < 0.5 || r.height < 0.5) continue
    boxes.push({
      left: r.left - pageRect.left + pageEl.scrollLeft,
      top: r.top - pageRect.top + pageEl.scrollTop,
      width: r.width,
      height: Math.max(r.height, 10),
    })
  }
  return mergeNearby(boxes)
}

function mergeNearby(boxes, gap = 4) {
  if (!boxes.length) return []
  const sorted = [...boxes].sort((a, b) => a.top - b.top || a.left - b.left)
  const out = []
  for (const box of sorted) {
    const prev = out[out.length - 1]
    if (
      prev &&
      Math.abs(prev.top - box.top) < gap &&
      box.left <= prev.left + prev.width + gap
    ) {
      const right = Math.max(prev.left + prev.width, box.left + box.width)
      const bottom = Math.max(prev.top + prev.height, box.top + box.height)
      prev.left = Math.min(prev.left, box.left)
      prev.top = Math.min(prev.top, box.top)
      prev.width = right - prev.left
      prev.height = bottom - prev.top
    } else {
      out.push({ ...box })
    }
  }
  return out
}

/** @returns {{ left:number, top:number, width:number, height:number }[]} */
export function findHighlightRects(pageEl, terms = []) {
  const layer = textLayer(pageEl)
  if (!layer) return []

  const { full, map } = buildCharMap(layer)
  if (!full) return []

  const hay = full.toUpperCase()
  const seen = new Set()
  const rects = []

  for (const term of terms) {
    const needle = String(term || '')
      .trim()
      .toUpperCase()
    if (needle.length < 2) continue

    let from = 0
    while (from < hay.length) {
      const idx = hay.indexOf(needle, from)
      if (idx === -1) break
      const key = `${idx}:${needle.length}`
      if (!seen.has(key)) {
        seen.add(key)
        rects.push(...rectsForRange(pageEl, map, idx, needle.length))
      }
      from = idx + needle.length
    }
  }

  return mergeNearby(rects, 2)
}
