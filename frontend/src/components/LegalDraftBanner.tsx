import { Link } from 'react-router-dom'
import { legalConfig, displayLegalValue } from '../config/legal'

export function LegalDraftBanner({ documentLabel }: { documentLabel: string }) {
  if (!legalConfig.draftPendingLegalReview) return null
  return (
    <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
      <strong>DRAFT — pending legal review:</strong> this {documentLabel} describes how the platform
      works today and is prepared for Kenyan counsel. It is <em>not</em> legal advice and does not
      claim ODPC registration or Data Protection Act compliance. See{' '}
      <code className="text-xs">docs/LEGAL_REVIEW_PACKET.md</code>.
      {' '}Version <code className="text-xs">{documentLabel === 'Privacy Policy' ? legalConfig.privacyPolicyVersion : legalConfig.termsVersion}</code>.
    </div>
  )
}

export function LegalContactBlock() {
  const entity = displayLegalValue(legalConfig.legalEntityName) ?? legalConfig.tradingName
  const address = displayLegalValue(legalConfig.physicalAddress)
  const dpo = displayLegalValue(legalConfig.dpoContactEmail)
  const privacyEmail = displayLegalValue(legalConfig.privacyContactEmail)
  const reg = displayLegalValue(legalConfig.registrationNumber)
  const odpc = displayLegalValue(legalConfig.odpcRegistrationNumber)

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="space-y-2 text-sm text-gray-700">
        <p><strong>{entity}</strong>{reg ? ` (Reg. ${reg})` : null}</p>
        {address ? <p>{address}</p> : null}
        {privacyEmail ? (
          <p>
            Privacy contact:{' '}
            <a className="text-luma-700 underline" href={`mailto:${privacyEmail}`}>{privacyEmail}</a>
          </p>
        ) : null}
        {dpo ? (
          <p>
            DPO / data protection contact:{' '}
            <a className="text-luma-700 underline" href={`mailto:${dpo}`}>{dpo}</a>
          </p>
        ) : null}
        {legalConfig.contactPhoneDisplay ? (
          <p>
            Phone:{' '}
            <a className="text-luma-700 underline" href={`tel:${legalConfig.contactPhoneTel}`}>
              {legalConfig.contactPhoneDisplay}
            </a>
          </p>
        ) : null}
        {legalConfig.whatsappUrl ? (
          <p>
            <a className="text-luma-700 underline" href={legalConfig.whatsappUrl} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          </p>
        ) : null}
        {odpc ? <p>ODPC registration: {odpc}</p> : (
          <p className="text-xs text-gray-500">ODPC registration number: to be confirmed (see ODPC checklist).</p>
        )}
        <p className="text-xs text-gray-500">
          Also see <Link className="text-luma-700 underline" to="/contact">Contact</Link>.
        </p>
      </div>
    </div>
  )
}
