import pg from 'pg'

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  await client.query("ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'Processing'")
  console.log('Added Processing to payment_status enum')
} catch (err) {
  console.log('Enum change result:', err.message)
}
await client.end()
