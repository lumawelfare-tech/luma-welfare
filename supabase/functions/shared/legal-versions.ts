/**
 * Current Privacy / Terms / Constitution versions accepted at registration.
 * MUST match frontend/src/config/legal.ts
 * (privacyPolicyVersion / termsVersion / constitutionVersion).
 * CI compares both files via scripts/check-legal-config.ts.
 */
export const PRIVACY_POLICY_VERSION = '2026-09-23.1'
export const TERMS_VERSION = '2026-09-23.1'
export const CONSTITUTION_VERSION = '2026-09-23.1'
/** Confirmation is not a versioned legal document. */
export const SELF_SUBMISSION_VERSION = '1'
