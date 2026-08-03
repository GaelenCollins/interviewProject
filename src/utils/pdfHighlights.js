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
  // Loose: allow missing word-boundary quirks from PDF text extraction
  const re = /(?:YEAR|YR\.?|PAYMENT|PERIOD|INSTALLMENT)\s*#?\s*([1-9]\d*)/gi
  const out = []
  let m
  while ((m = re.exec(hay)) !== null) {
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      yearNum: String(m[1]),
    })
  }
  return out
}

function normalizePeriodToken(text) {
  const m = String(text || '').match(
    /(?:YEAR|YR\.?|PAYMENT|PERIOD|INSTALLMENT)\s*#?\s*([1-9]\d*)/i,
  )
  return m ? m[1] : null
}

function rectCenterY(r) {
  return r.top + r.height / 2
}

function rectCenterX(r) {
  return r.left + r.width / 2
}

/** Merge multi-span hits into one box for geometry comparisons. */
function unionRect(boxes) {
  if (!boxes?.length) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const b of boxes) {
    left = Math.min(left, b.left)
    top = Math.min(top, b.top)
    right = Math.max(right, b.left + b.width)
    bottom = Math.max(bottom, b.top + b.height)
  }
  if (!Number.isFinite(left)) return null
  return { left, top, width: right - left, height: bottom - top }
}

function hitFromRange(pageEl, map, start, length, yearNum) {
  const box = unionRect(rectsForRange(pageEl, map, start, length))
  if (!box) return null
  return {
    yearNum: yearNum ? String(yearNum) : null,
    box,
    cy: rectCenterY(box),
    cx: rectCenterX(box),
    right: box.left + box.width,
    left: box.left,
  }
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
 * Highlight problem-year labels + the payment amount that belongs on that row.
 *
 * Strategy:
 * 1. Find every Year/Payment N label on the page (geometry + year).
 * 2. Find every expected dollar amount occurrence.
 * 3. Assign each amount to its nearest period label by Y (same visual row).
 * 4. Keep only amounts whose nearest label is a problem year.
 *
 * Falls back to label-only term search if geometry pairing finds nothing.
 *
 * @param {Array<{ labels?: string[], amounts?: string[], yearNums?: string[] }>} pairs
 */
export function findPairedScheduleHighlightRects(pageEl, pairs = []) {
  const layer = textLayer(pageEl)
  if (!layer) return []
  if (!Array.isArray(pairs) || !pairs.length) return []

  const { full, map } = buildCharMap(layer)
  if (!full) return []

  const hay = full.toUpperCase()

  const problemYearNums = new Set()
  const labelTerms = new Set()
  const expectedAmounts = new Set()

  for (const pair of pairs) {
    for (const y of pair.yearNums || []) {
      if (y != null && String(y).trim()) problemYearNums.add(String(y))
    }
    for (const lab of pair.labels || []) {
      const t = String(lab || '').trim()
      if (t.length >= 2) labelTerms.add(t.toUpperCase())
      const n = normalizePeriodToken(lab)
      if (n) problemYearNums.add(n)
    }
    for (const a of pair.amounts || []) {
      const t = String(a || '').trim().toUpperCase()
      if (t.length >= 2) expectedAmounts.add(t)
    }
  }

  // Ensure we always search Year N even if pairs only carried amounts
  for (const y of problemYearNums) {
    labelTerms.add(`YEAR ${y}`)
    labelTerms.add(`YR ${y}`)
    labelTerms.add(`YR. ${y}`)
    labelTerms.add(`PERIOD ${y}`)
    labelTerms.add(`PAYMENT ${y}`)
    labelTerms.add(`PAYMENT #${y}`)
  }

  if (!problemYearNums.size && !labelTerms.size) return []

  // --- All period labels on page (any year — needed for nearest-row assignment) ---
  const labelByKey = new Map()
  const rememberLabel = (hit) => {
    if (!hit?.box) return
    const key = `${hit.yearNum || '?'}:${Math.round(hit.cy)}:${Math.round(hit.left)}`
    if (!labelByKey.has(key)) labelByKey.set(key, hit)
  }

  for (const lab of findPeriodLabelMatches(hay)) {
    rememberLabel(
      hitFromRange(pageEl, map, lab.start, lab.end - lab.start, lab.yearNum),
    )
  }

  // Explicit label terms (handles odd PDF wording the regex misses)
  for (const needle of labelTerms) {
    for (const idx of findAllMatches(hay, needle)) {
      const matched = hay.slice(idx, idx + needle.length)
      const yearNum =
        normalizePeriodToken(matched) ||
        normalizePeriodToken(needle) ||
        matched.match(/([1-9]\d*)\s*$/)?.[1] ||
        null
      rememberLabel(
        hitFromRange(pageEl, map, idx, needle.length, yearNum),
      )
    }
  }

  const allLabels = [...labelByKey.values()]
  const problemLabels = allLabels.filter(
    (l) => l.yearNum && problemYearNums.has(String(l.yearNum)),
  )

  // --- Amount candidates ---
  const amountHits = []
  const amountSeen = new Set()
  const orderedAmounts = [...expectedAmounts].sort((a, b) => b.length - a.length)

  for (const needle of orderedAmounts) {
    for (const idx of findAllMatches(hay, needle)) {
      const key = `${idx}:${needle.length}`
      if (amountSeen.has(key)) continue
      amountSeen.add(key)
      const box = unionRect(rectsForRange(pageEl, map, idx, needle.length))
      if (!box) continue
      amountHits.push({
        box,
        cy: rectCenterY(box),
        cx: rectCenterX(box),
        left: box.left,
        idx,
      })
    }
  }

  // Also catch common money shapes near the schedule if expected strings missed
  // (e.g. thin-space after $, missing commas in text layer).
  if (!amountHits.length && problemLabels.length) {
    const moneyRe = /\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2}/g
    let m
    while ((m = moneyRe.exec(hay)) !== null) {
      const box = unionRect(rectsForRange(pageEl, map, m.index, m[0].length))
      if (!box) continue
      amountHits.push({
        box,
        cy: rectCenterY(box),
        cx: rectCenterX(box),
        left: box.left,
        idx: m.index,
      })
    }
  }

  const out = []
  const seenBox = new Set()
  const pushBox = (box) => {
    if (!box) return
    const key = `${Math.round(box.left)}:${Math.round(box.top)}:${Math.round(box.width)}`
    if (seenBox.has(key)) return
    seenBox.add(key)
    out.push({ ...box })
  }

  // Always highlight problem-year labels we found
  for (const label of problemLabels) pushBox(label.box)

  // Assign each amount to nearest period label by Y; keep if that label is a problem year
  if (allLabels.length && amountHits.length) {
    for (const amt of amountHits) {
      let nearest = null
      let best = Infinity
      for (const lab of allLabels) {
        const dy = Math.abs(amt.cy - lab.cy)
        const toRightBoost = amt.left >= lab.right - 8 ? 0 : 25
        const score = dy + toRightBoost
        if (score < best) {
          best = score
          nearest = lab
        }
      }
      if (!nearest?.yearNum) continue
      if (!problemYearNums.has(String(nearest.yearNum))) continue
      // Reject if clearly on a different row (more than ~1.5 line-heights away)
      if (Math.abs(amt.cy - nearest.cy) > 28) continue
      pushBox(amt.box)
    }
  } else if (problemLabels.length && amountHits.length) {
    // No non-problem labels for comparison — claim nearest amount per problem label
    const claimed = new Set()
    const labelsSorted = [...problemLabels].sort((a, b) => a.cy - b.cy)
    for (const label of labelsSorted) {
      let best = null
      let bestScore = Infinity
      amountHits.forEach((amt, i) => {
        if (claimed.has(i)) return
        const dy = Math.abs(amt.cy - label.cy)
        const score =
          dy + (amt.left >= label.right - 8 ? 0 : 25)
        if (score < bestScore) {
          bestScore = score
          best = i
        }
      })
      if (best == null) continue
      if (Math.abs(amountHits[best].cy - label.cy) > 40) continue
      claimed.add(best)
      pushBox(amountHits[best].box)
    }
  }

  // Fallback: at least show label term highlights so the issue isn't invisible
  if (!out.length) {
    const fallbackTerms = [...labelTerms]
    return findHighlightRects(pageEl, fallbackTerms)
  }

  return mergeNearby(out, 2)
}
