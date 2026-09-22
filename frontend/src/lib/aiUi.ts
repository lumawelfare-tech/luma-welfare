/**
 * Frontend-only AI assistant UI helpers.
 * Server `AI_ASSISTANT_ENABLED` remains the real gate — this never enables RAG alone.
 */

export const AI_ASSISTANT_DISABLED_COPY =
  'The help assistant is not enabled yet. Browse FAQ and Organization documents, or contact support.'

/** True when VITE_AI_ASSISTANT_UI=true (show nav/entry points). Server may still refuse. */
export function isAiAssistantUiEnabled(): boolean {
  return String(import.meta.env.VITE_AI_ASSISTANT_UI ?? '').toLowerCase() === 'true'
}
