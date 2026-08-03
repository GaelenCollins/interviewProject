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

function findAllMatches(hay, needle) {
  const out = []
  if (!needle || needle.length < 2) return out
  let from = 0
  while (from < hay.length) {
    const idx = hay.indexOf(needle, from)
    if (idx === -1) break
    out.push(idx)
    from = idx + needle.length
  }
  return out
}

/** Period-like labels in the page text (Year 1, Payment #2, …). */
function findPeriodLabelMatches(hay) {
  const re = /\b(?:YEAR|YR\.?|PAYMENT|PERIOD|INSTALLMENT)\s*#?\s*[1-9]\d*\b/g
  const out = []
  let m
  while ((m = re.exec(hay)) !== null) {
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
    })
  }
  return out
}

function normalizePeriodToken(text) {
  const m = String(text || '').match(
    /\b(?:YEAR|YR\.?|PAYMENT|PERIOD|INSTALLMENT)\s*#?\s*([1-9]\d*)\b/i,
  )
  return m ? m[1] : null
}

/**
 * Keep an amount match only when the closest preceding period label
 * is one of the problem-year labels (so equal Year 2 $ doesn't light up for Year 1).
 */
function amountBelongsToProblemYear(hay, amountIdx, problemYearNums) {
  const labels = findPeriodLabelMatches(hay)
  let closest = null
  for (const lab of labels) {
    if (lab.start > amountIdx) continue
    if (amountIdx - lab.end > 160) continue // too far left
    if (!closest || lab.start > closest.start) closest = lab
  }
  if (!closest) return false
  const yearNum = normalizePeriodToken(closest.text)
  return yearNum != null && problemYearNums.has(yearNum)
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

    for (const idx of findAllMatches(hay, needle)) {
      const key = `${idx}:${needle.length}`
      if (seen.has(key)) continue
      seen.add(key)
      rects.push(...rectsForRange(pageEl, map, idx, needle.length))
    }
  }

  return mergeNearby(rects, 2)
}

/**
 * Highlight problem-year labels + only the payment amounts on those same rows.
 * @param {Array<{ labels?: string[], amounts?: string[], yearNums?: string[] }>} pairs
 */
export function findPairedScheduleHighlightRects(pageEl, pairs = []) {
  const layer = textLayer(pageEl)
  if (!layer) return []
  if (!Array.isArray(pairs) || !pairs.length) return []

  const { full, map } = buildCharMap(layer)
  if (!full) return []

  const hay = full.toUpperCase()
  const seen = new Set()
  const rects = []

  const problemYearNums = new Set()
  for (const pair of pairs) {
    for (const y of pair.yearNums || []) problemYearNums.add(String(y))
    for (const lab of pair.labels || []) {
      const n = normalizePeriodToken(lab)
      if (n) problemYearNums.add(n)
    }
  }

  for (const pair of pairs) {
    const labels = (pair.labels || [])
      .map((t) => String(t || '').trim().toUpperCase())
      .filter((t) => t.length >= 2)
    const amounts = (pair.amounts || [])
      .map((t) => String(t || '').trim().toUpperCase())
      .filter((t) => t.length >= 2)

    for (const needle of labels) {
      for (const idx of findAllMatches(hay, needle)) {
        const key = `L:${idx}:${needle.length}`
        if (seen.has(key)) continue
        seen.add(key)
        rects.push(...rectsForRange(pageEl, map, idx, needle.length))
      }
    }

    for (const needle of amounts) {
      for (const idx of findAllMatches(hay, needle)) {
        if (!amountBelongsToProblemYear(hay, idx, problemYearNums)) continue
        const key = `A:${idx}:${needle.length}`
        if (seen.has(key)) continue
        seen.add(key)
        rects.push(...rectsForRange(pageEl, map, idx, needle.length))
      }
    }
  }

  return mergeNearby(rects, 2)
}
