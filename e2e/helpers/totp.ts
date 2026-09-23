/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30s). Used only by E2E helpers.
 * Do not use this to attack accounts — it generates a code from a secret we already hold.
 */
import { createHmac } from 'node:crypto'

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function decodeBase32(secret: string): Buffer {
  const cleaned = secret.replace(/[\s=-]/g, '').toUpperCase()
  let bits = ''
  for (const char of cleaned) {
    const val = BASE32.indexOf(char)
    if (val === -1) continue
    bits += val.toString(2).padStart(5, '0')
  }
  const bytes = Buffer.alloc(Math.floor(bits.length / 8))
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
  }
  return bytes
}

export function generateTotp(secret: string, nowMs = Date.now(), periodSec = 30): string {
  const key = decodeBase32(secret)
  const counter = Math.floor(nowMs / 1000 / periodSec)
  const msg = Buffer.alloc(8)
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  msg.writeUInt32BE(counter >>> 0, 4)
  const hash = createHmac('sha1', key).update(msg).digest()
  const offset = hash[hash.length - 1] & 0x0f
  const code = (
    ((hash[offset] & 0x7f) << 24)
    | ((hash[offset + 1] & 0xff) << 16)
    | ((hash[offset + 2] & 0xff) << 8)
    | (hash[offset + 3] & 0xff)
  ) % 1_000_000
  return code.toString().padStart(6, '0')
}
