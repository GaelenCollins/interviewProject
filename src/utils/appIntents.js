/**
 * Detect in-app actions the user asked for in chat (so we can start them
 * without requiring a header/button click).
 */

/**
 * @typedef {'email' | 'calculator' | 'annotated_pdf' | null} AppIntent
 */

/**
 * @param {string} text
 * @returns {AppIntent}
 */
export function detectAppIntent(text) {
  const t = String(text || '').trim().toLowerCase()
  if (!t) return null

  // Email draft download (.eml + annotated PDF attachment)
  if (
    /\b(email|e-mail|eml|outlook|mail)\b/.test(t) &&
    /\b(send|draft|download|prepare|create|write|compose|share|boss|manager|attach|attachment|report)\b/.test(
      t,
    )
  ) {
    return 'email'
  }
  if (
    /\b(send|email|mail)\b.+\b(boss|manager|report)\b/.test(t) ||
    /\bemail report\b/.test(t) ||
    /\bdownload (the )?email\b/.test(t) ||
    /\bemail draft\b/.test(t)
  ) {
    return 'email'
  }

  // Margin / scientific calculator modal
  if (
    /\b(open|use|show|launch|start)\b.+\bcalculator\b/.test(t) ||
    /\bcalculator\b.+\b(open|please|margin|sale|price)\b/.test(t) ||
    /^(open |show )?(the )?calculator\b/.test(t)
  ) {
    return 'calculator'
  }

  // Annotated PDF export from the PDF viewer toolbar
  if (
    /\b(annotated|markup|highlighted)\b.+\bpdf\b/.test(t) ||
    /\bexport\b.+\b(annotated )?pdf\b/.test(t) ||
    /\bdownload\b.+\bannotated\b/.test(t)
  ) {
    return 'annotated_pdf'
  }

  return null
}

/** Short assistant copy when we start an action from chat. */
export function messageForAppIntent(intent, { hasPdf = false } = {}) {
  if (intent === 'email') {
    if (!hasPdf) {
      return 'To prepare an email with an annotated PDF attachment, upload a Dynamix Customer Quote (PDF) and run a check first. You can also use the email button in the header after a check completes.'
    }
    return 'Starting the email download for you now. That builds a .eml draft with an annotated PDF of the active findings attached. Watch the progress bar at the top — then open the file in your email app, add the recipient, and send. (The app does not send mail by itself.)'
  }
  if (intent === 'calculator') {
    return 'Opening the Calculator for you. Use the Sale Price or Margin % tabs for target-price math, or the Calculator tab for general arithmetic.'
  }
  if (intent === 'annotated_pdf') {
    if (!hasPdf) {
      return 'Upload a Dynamix Customer Quote (PDF) and run a check first, then I can export an annotated PDF (or use Export Annotated PDF in the PDF toolbar).'
    }
    return 'Exporting an annotated PDF with the active findings highlighted. You can also use Export Annotated PDF in the PDF viewer toolbar anytime.'
  }
  return null
}
