import 'dotenv/config'
import { loadDarajaConfig, getAccessToken } from '../services/daraja/index.js'

async function testOAuth() {
  try {
    const config = loadDarajaConfig()
    console.log('Daraja config loaded successfully')
    console.log('  Environment:', config.env)
    console.log('  Shortcode:', config.shortcode)
    console.log('  Base URL:', config.env === 'sandbox' ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke')
    console.log('  Has consumer key:', !!config.consumerKey)
    console.log('  Has consumer secret:', !!config.consumerSecret)
    console.log('  Has passkey:', !!config.passkey)
    console.log('')

    // Test OAuth token request
    console.log('Requesting OAuth token from sandbox...')
    const result = await getAccessToken(config)
    console.log('OAuth result:', result.success ? 'SUCCESS' : 'FAIL')
    if (result.success) {
      const token = result.data
      console.log('  Token type:', typeof token)
      console.log('  Token length:', token?.length ?? 0)
      console.log('  Token starts with:', token?.substring(0, 5) + '...')
    } else {
      console.error('  Error:', result.error)
      console.error('  Error code:', result.errorCode)
    }
    console.log('')

    console.log('OAuth sandbox:', result.success ? 'PASS' : 'FAIL')
  } catch (error) {
    console.error('OAuth sandbox: FAIL')
    console.error('Error:', error?.message || error)
  }
}

testOAuth()
