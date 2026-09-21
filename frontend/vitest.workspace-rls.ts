import { defineConfig } from 'vitest/config'

/** Minimal Vitest config for scripts/ live suites (no jsdom). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/__tests__/**/*.live.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
