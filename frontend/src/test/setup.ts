import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Clean up after each test
afterEach(() => {
  cleanup()
})

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Suppress unhandled promise rejection warnings from fake-timer retry tests
process.on('unhandledRejection', () => {})

// Mock fetch globally
const _fetchMock = vi.fn()
Object.defineProperty(globalThis, 'fetch', { value: _fetchMock, writable: true })
// Expose for test files that need to access/modify the mock
Object.defineProperty(globalThis, 'fetchMock', { value: _fetchMock, writable: true })

// Mock URL.createObjectURL / revokeObjectURL
Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:mock', writable: true })
Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, writable: true })

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock import.meta.env
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key')

// Suppress console.error during tests (optional, remove if noisy)
// vi.spyOn(console, 'error').mockImplementation(() => {})
