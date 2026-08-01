/** 0-based column index → Excel letter (A, B, …, AA) */
export function excelColLetter(index) {
  if (index == null || index < 0) return null
  let n = index
  let s = ''
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}
