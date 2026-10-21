// The daily review's door into the system (migration 040), for «موظف المتابعة والاقتراحات والحلول»:
//   node scripts/advisor.mjs brief          → counts and coming exhibitions (no client names or numbers),
//                                             and the tasks already on the owner's list
//   node scripts/advisor.mjs add items.json → add tasks / suggestions / problems (an array, ≤ 20)
// The secret code is read from the SOVA_RESEARCH_TOKEN environment variable (the same code as the
// research) — never from a file in the repository.
import { readFileSync } from 'node:fs'

// Inside a proxied environment Node's fetch must be told to use the proxy: re-run once with it on.
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const { spawnSync } = await import('node:child_process')
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } })
  process.exit(r.status ?? 1)
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const token = process.env.SOVA_RESEARCH_TOKEN
if (!token) {
  console.error('SOVA_RESEARCH_TOKEN is not set in this environment.')
  process.exit(2)
}

async function rpc(name, body) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_PUBLISHABLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token, ...body }),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`${name} failed (${res.status}): ${text.slice(0, 300)}`)
    process.exit(1)
  }
  return text ? JSON.parse(text) : null
}

const [cmd, file] = process.argv.slice(2)
if (cmd === 'brief') {
  console.log(JSON.stringify(await rpc('advisor_brief', {}), null, 2))
} else if (cmd === 'add' && file) {
  const rows = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(rows) || rows.length > 20) {
    console.error('The file must hold an array of at most 20 items.')
    process.exit(1)
  }
  console.log(JSON.stringify(await rpc('add_advisor_items', { p_rows: rows })))
} else {
  console.error('Usage: node scripts/advisor.mjs brief | add <items.json>')
  process.exit(1)
}
