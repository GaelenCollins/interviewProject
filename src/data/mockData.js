export const MOCK_ERRORS = [
  {
    id: 1,
    severity: 'CRITICAL',
    page: 2,
    sku: 'RS-HW-SVC-PE-S3',
    message:
      'CRITICAL: Possible error on page 2 with item RS-HW-SVC-PE-S3. The margin is 0.00%, when all other margins are around 10.02%.',
    actions: [
      {
        label: 'Click to see margins broken down',
        query: 'Show me the margin breakdown for RS-HW-SVC-PE-S3',
        responseKey: 'margin_critical',
      },
      {
        label: 'What could have caused this error?',
        query: 'What could have caused the 0% margin error on RS-HW-SVC-PE-S3?',
        responseKey: 'cause_critical',
      },
      {
        label: 'What should the value be changed to?',
        query: 'What should the unit price be changed to for RS-HW-SVC-PE-S3?',
        responseKey: 'fix_critical',
      },
    ],
  },
  {
    id: 2,
    severity: 'WARNING',
    page: 1,
    sku: null,
    message:
      'WARNING: Possible error on page 1 with Project name. The coterm could be inaccurate.',
    actions: [
      {
        label: 'What could have caused this error?',
        query: 'What could have caused the coterm date warning on page 1?',
        responseKey: 'cause_warning',
      },
      {
        label: 'What should the value be changed to?',
        query: 'What should the coterm date be changed to?',
        responseKey: 'fix_warning',
      },
    ],
  },
]

export const AI_RESPONSES = {
  welcome:
    "Hello! I'm your AI checking assistant. Upload your distributor Excel quote and customer PDF quote to begin the check.",
  uploaded:
    "Files uploaded and check complete. I've analyzed both documents and found **2 discrepancies**:\n\n1. CRITICAL: Zero-margin line item on page 2\n2. WARNING: Possible coterm date mismatch on page 1\n\nClick an error card action to dig in, or ask me anything.",
  default:
    "I'm your AI checking assistant. I've analyzed both documents and found 2 discrepancies. Ask me anything about the flagged items or the quote structure.",
  margin_critical:
    '**Margin breakdown for RS-HW-SVC-PE-S3:**\n\n• Unit Price: $10,303.98\n• Cost Basis: $10,303.98\n• Margin %: **0.00%**\n• Expected Margin: ~10.02%\n\nThis item appears to have been priced at exact cost, yielding zero margin. All other line items show ~10% margin.',
  cause_critical:
    '**Likely causes for 0% margin on RS-HW-SVC-PE-S3:**\n\n1. Manual override — unit price may have been entered at cost in the distributor spreadsheet.\n2. Formula break — the Excel margin formula may reference an incorrect cell.\n3. Wrong SKU mapping — cost-basis price tier used instead of list price.',
  fix_critical:
    '**Recommended correction for RS-HW-SVC-PE-S3:**\n\nApply the standard 10.02% margin to the cost basis:\n\n$10,303.98 ÷ (1 − 0.1002) ≈ **$11,451.25**\n\nUpdate Unit Price and Extended Price to $11,451.25 (qty 1).',
  cause_warning:
    '**Likely causes for coterm date concern:**\n\nThe Project Name references FY2026, but the coterm date (10/28/2029) falls in FY2029. This may mean the project naming was not updated when the coterm was set, or the fiscal year label does not match the subscription anchor.',
  fix_warning:
    '**Recommended correction for coterm date:**\n\nVerify the coterm against the customer\'s active subscription anchor. If the Rubrik subscription ends 10/28/2029, the coterm is correct — update the Project Name instead. If the subscription ends earlier, update the coterm to match.',
  generic:
    'Based on the check data, the CRITICAL error is a zero-margin line item (financially significant). The WARNING is a possible date/naming inconsistency. Want me to draft a correction memo for the distributor?',
}

export const QUOTE_OVERVIEW = [
  { label: 'Customer', value: 'Westbridge Financial Group' },
  { label: 'Project Name', value: 'FY2026 Infrastructure Renewal' },
  { label: 'Quote Number', value: '20260318.1316 Rev 03' },
  { label: 'Quote Date', value: 'March 18, 2026' },
  { label: 'Coterm Date', value: '10/28/2029', badgeId: 2 },
  { label: 'Sales Rep', value: 'D. Harrington' },
  { label: 'Payment Terms', value: 'Net 30' },
  { label: 'Currency', value: 'USD' },
]

export const QUOTE_META = [
  { label: 'Quote Number', value: '20260318.1316 Rev 03' },
  { label: 'Item Number', value: 'Appliance Subscription' },
  {
    label: 'Item Description',
    value:
      'Rubrik Foundation Edition Premium Support – Coverage through 10/28/2029 – 3 Annual Payments.',
  },
  { label: 'Ship To', value: 'Westbridge Financial Group\n[Address redacted]' },
  {
    label: 'Item Group',
    value: 'Coverage dates 10/29/2026 – 10/28/2029 for SN AA202564160017',
  },
  { label: 'Period', value: '36 Months' },
  {
    label: 'Payment',
    value: 'Annual payments (refer to billing schedule below for detail)',
  },
  { label: 'Renewal', value: 'Terminates End of Period' },
]

export const BILLING_SCHEDULE = [
  { period: 'Year 1', payment: '$31,844.80' },
  { period: 'Year 2', payment: '$63,689.59' },
  { period: 'Year 3', payment: '$63,689.59' },
  { period: 'Total', payment: '$159,223.98', bold: true },
]

export const PRODUCTS = [
  {
    sku: 'RS-HW-SVC-PE-S3',
    desc: 'Rubrik Support for R6000S-3 hardware, prepay; Premium support',
    qty: 1,
    unit: '$10,303.98',
    ext: '$10,303.98',
    flagBadge: 1,
  },
  {
    sku: 'RS-BT-FE-PE-PA',
    desc: 'Rubrik Foundation Edition; per usable BETB; Premium support; pay annual',
    qty: 120,
    unit: '$1,241.00',
    ext: '$148,920.00',
  },
]

export const TOTAL_PAGES = 5
