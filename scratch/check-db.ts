import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

try {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const match = line.match(/^\s*([^#\s=]+)\s*=\s*(.*)$/)
      if (match) {
        const key = match[1].trim()
        let val = match[2].trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1)
        }
        process.env[key] = val
      }
    }
  }
} catch (e) {
  console.warn('Failed to parse .env.local manually:', e)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing credentials in env.local')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

async function checkFirms() {
  const { data: clients, error } = await admin.from('client').select('*')
  if (error) {
    console.error('Error fetching clients:', error.message)
    return
  }
  console.log('Clients in database:')
  console.log(JSON.stringify(clients, null, 2))
}

checkFirms()
