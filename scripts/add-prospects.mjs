// The daily research's only door into the system (migration 035):
//   node scripts/add-prospects.mjs known            → the names / accounts / sites already on file
//   node scripts/add-prospects.mjs add found.json   → add the day's findings (an array, ≤ 50)
// The secret code is read from the SOVA_RESEARCH_TOKEN environment variable — never from a file
// in the repository. The Supabase address and public key come from .env (public by design).
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
const token = process.env.SOVA_RESEARCH_TOKEN
if (!token) {
  console.error('SOVA_RESEARCH_TOKEN is not set in this environment — ask the admin to create the code in the system and add it to the environment settings.')
  process.exit(2)
}

async function rpc(name, body) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token, ...body }),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`${name} failed (${res.status}): ${text.slice(0, 300)}`)
    process.exit(1)
  }
  return JSON.parse(text)
}

const [cmd, file] = process.argv.slice(2)
if (cmd === 'known') {
  console.log(JSON.stringify(await rpc('known_prospects', {})))
} else if (cmd === 'add' && file) {
  const rows = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(rows) || rows.length > 50) {
    console.error('The file must hold an array of at most 50 prospects.')
    process.exit(1)
  }
  console.log(JSON.stringify(await rpc('add_prospects', { p_rows: rows })))
} else {
  console.error('Usage: node scripts/add-prospects.mjs known | add <file.json>')
  process.exit(1)
}
