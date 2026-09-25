/**
 * Runtime check that unpdf@1.8.1 extractText returns real page text.
 * Edge extractPdfText uses the same getDocumentProxy + extractText({ mergePages: true }) API.
 */
import { describe, it, expect } from 'vitest'
import { extractText, getDocumentProxy } from 'unpdf'
import { normalizeKbText } from '../kbRagText'

function xrefEntry(offset: number, gen = 0, free = false): string {
  return `${String(offset).padStart(10, '0')} ${String(gen).padStart(5, '0')} ${free ? 'f' : 'n'} \n`
}

/** Minimal one-page PDF with a standard Helvetica string we can extract. */
function pdfWithVisibleText(label: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${label}) Tj ET`
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body))
    body += obj
  }
  const xrefStart = Buffer.byteLength(body)
  let xref = 'xref\n0 6\n' + xrefEntry(0, 65535, true)
  for (let i = 1; i <= 5; i++) xref += xrefEntry(offsets[i])
  body += xref
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return new Uint8Array(Buffer.from(body, 'latin1'))
}

describe('unpdf 1.8.1 text extraction', () => {
  it('extracts the visible string from a one-page PDF', async () => {
    const marker = 'LUMA Welfare registration fee'
    const pdf = await getDocumentProxy(pdfWithVisibleText(marker))
    const { text, totalPages } = await extractText(pdf, { mergePages: true })
    expect(totalPages).toBe(1)
    expect(typeof text).toBe('string')
    const normalized = normalizeKbText(typeof text === 'string' ? text : text.join('\n\n'))
    expect(normalized).toContain(marker)
    expect(normalized.length).toBeGreaterThan(10)
  })
})
