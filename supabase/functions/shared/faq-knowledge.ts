/**
 * Static FAQ / About knowledge for the hybrid assistant (Phase 7).
 * Safe org copy only — never member PII, claims, or payments data.
 */

export type FaqEntry = {
  id: string
  category: string
  question: string
  answer: string
}

export const FAQ_KNOWLEDGE: FaqEntry[] = [
  { id: 'general-0', category: 'General', question: 'What is Luma Welfare?', answer: 'Luma Welfare is a community welfare organisation that helps members support each other through key life events — from hospital bills and education costs to bereavement, building, farming, weddings, and more. Members contribute monthly to one or more packages and can submit claims when eligible.' },
  { id: 'general-1', category: 'General', question: 'How does Luma Welfare work?', answer: 'You register an account and verify your email with a one-time passcode (OTP). After admin approval and the one-time KSh 300 activation fee is verified, you can join welfare packages. Each package has its own monthly contribution and waiting period. Once you qualify, you can submit claims according to that package’s rules.' },
  { id: 'general-2', category: 'General', question: 'Who can join?', answer: 'Anyone can register for a Luma Welfare account, verify email, and submit a membership application. After approval and fee verification, you can explore and subscribe to available welfare packages.' },
  { id: 'packages-0', category: 'Packages', question: 'What are Luma Welfare packages?', answer: 'Packages are welfare categories you can subscribe to (for example burial support, hospital, education, business, building, farming, wedding, disaster relief, and more). Each has its own contribution amount and rules.' },
  { id: 'packages-1', category: 'Packages', question: 'Can I belong to more than one package?', answer: 'Yes. You can subscribe to multiple packages. Each is tracked independently for contributions, waiting period, and qualification.' },
  { id: 'contributions-0', category: 'Contributions', question: 'How do I make a contribution?', answer: 'From your member dashboard, open Contributions, record a payment with package, amount, method, and reference. An administrator reviews and verifies it. Online M-Pesa STK is not the default live path yet.' },
  { id: 'claims-0', category: 'Claims', question: 'How do I submit a claim?', answer: 'Open Claims in your member portal, choose the package, describe the need, upload supporting documents, and submit. Administrators review using a checklist. This assistant cannot approve or reject claims.' },
  { id: 'claims-1', category: 'Claims', question: 'What claim statuses can I expect?', answer: 'Draft, Submitted, Under Review, Additional Information Required, Approved, Rejected, or Paid. You receive notifications as status changes.' },
  { id: 'account-0', category: 'Account', question: 'How do I update my profile?', answer: 'Sign in and open Profile from your dashboard to update name, phone, photo, and other details.' },
  { id: 'account-1', category: 'Account', question: 'How do I manage family members / beneficiaries?', answer: 'Open Family & beneficiaries from your dashboard to add and manage dependants linked to your account.' },
  { id: 'security-0', category: 'Security', question: 'How is my information protected?', answer: 'Luma Welfare uses encrypted transmission, secure authentication, role-based admin access, and row-level security. Admin actions are audited. This assistant never reads your private claim files or payment records.' },
  { id: 'payments-0', category: 'Payments', question: 'Is M-Pesa available for payments?', answer: 'M-Pesa integration is prepared but not enabled for live STK by default. Contributions and fees are typically recorded manually and verified by administrators until payments go live.' },
  { id: 'payments-1', category: 'Payments', question: 'How do I pay my activation fee?', answer: 'A one-time KSh 300 activation fee is required. Online M-Pesa may be unavailable; an administrator can verify the fee. You will be notified when online payment is enabled.' },
  { id: 'docs-0', category: 'Documents', question: 'Where are organization handbooks?', answer: 'Approved member-facing handbooks and policies appear under My documents → Organization documents. Staff-only and restricted files are never shown to members.' },
]

export const ABOUT_BLURB = {
  id: 'about-mission',
  title: 'About Luma Welfare',
  content:
    'Luma Welfare is a community welfare organisation. Members contribute to packages and may claim support for eligible life events according to package rules. For official policy text, use approved organization documents in the member portal.',
}

/** Queries we must refuse — no claim/payment decisions, no PII fishing. */
const REFUSE_PATTERNS: RegExp[] = [
  /\b(approve|reject|verify)\b.*\b(claim|payment|contribution|payout)\b/i,
  /\b(claim|payment|contribution|payout)\b.*\b(approve|reject|verify)\b/i,
  /\b(show|list|export|dump)\b.*\b(member|members|phone|email|id number|national id|password)\b/i,
  /\b(my|their)\b.*\b(balance|mpesa|daraja|stk)\b/i,
  /\bservice[_\s-]?role\b/i,
  /\b(ignore|bypass)\b.*\b(policy|security|rls)\b/i,
]

export function shouldRefuseQuery(query: string): string | null {
  const q = query.trim()
  if (!q) return 'Please ask a question about Luma Welfare membership, packages, contributions, or claims process.'
  for (const re of REFUSE_PATTERNS) {
    if (re.test(q)) {
      return 'I can only help with general Luma Welfare information. I cannot approve claims or payments, access private member data, or change account status. Use Claims, Contributions, or contact support for account-specific actions.'
    }
  }
  return null
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
}

/** Simple FAQ scorer — no external APIs. */
export function matchFaq(query: string, limit = 3): Array<FaqEntry & { score: number }> {
  const qTokens = new Set(tokenize(query))
  if (qTokens.size === 0) return []
  const scored = FAQ_KNOWLEDGE.map((entry) => {
    const hay = tokenize(`${entry.question} ${entry.answer} ${entry.category}`)
    let hit = 0
    for (const t of qTokens) {
      if (hay.includes(t)) hit++
      if (entry.question.toLowerCase().includes(t)) hit += 1
    }
    const score = hit / Math.max(qTokens.size, 1)
    return { ...entry, score }
  })
    .filter((e) => e.score >= 0.25)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

export function isAiAssistantEnabled(): boolean {
  return Deno.env.get('AI_ASSISTANT_ENABLED') === 'true'
}
