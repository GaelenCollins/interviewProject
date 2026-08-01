export const DISTRIBUTOR_QUOTE = 'Distributor Quote (Excel Source)'
export const CUSTOMER_QUOTE = 'Dynamix Customer Quote (PDF)'

export function skuLabel(sku) {
  if (sku == null || sku === '') return 'SKU'
  const s = String(sku).trim()
  if (/^sku\b/i.test(s)) return s
  return `SKU ${s}`
}

export function itemLabel(line) {
  if (line == null || line === '') return null
  const n = String(line).trim()
  if (/^item\s*#/i.test(n)) return n
  return `item #${n}`
}
