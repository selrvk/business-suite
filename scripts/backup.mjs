// Saves every app table to backups/<date-time>/<table>.json. Read-only.
// Run before changing the database: node --env-file=.env scripts/backup.mjs
import { mkdirSync, writeFileSync } from "node:fs"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. node --env-file=.env ...)")

const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" }
const spec = await (await fetch(`${url}/rest/v1/`, { headers })).json()
const tables = Object.keys(spec.definitions ?? {})

const dir = `backups/${new Date().toISOString().replace(/[:.]/g, "-")}`
mkdirSync(dir, { recursive: true })

for (const table of tables) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` },
    })
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < 1000) break
  }
  writeFileSync(`${dir}/${table}.json`, JSON.stringify(rows, null, 2))
  console.log(`${table.padEnd(18)} ${rows.length} rows`)
}

// Logins (ids, emails and dates only; passwords are never readable).
const users = []
for (let page = 1; ; page++) {
  const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  const batch = (await res.json()).users ?? []
  users.push(...batch.map(u => ({ id: u.id, email: u.email, created_at: u.created_at })))
  if (batch.length < 1000) break
}
writeFileSync(`${dir}/auth_users.json`, JSON.stringify(users, null, 2))
console.log(`${"auth users".padEnd(18)} ${users.length}`)
console.log(`\nSaved to ${dir}/`)
