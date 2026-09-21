import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/** Vitest config for live RLS suite at repo root (scripts/__tests__). */
export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  test: {
    environment: 'node',
    include: ['scripts/__tests__/**/*.live.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
})
