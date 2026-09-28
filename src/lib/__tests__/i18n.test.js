import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import EN from '../i18n.en.js'
import { tr } from '../i18n.js'

const SRC = join(import.meta.dirname, '..', '..')

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path)
    return /\.(js|jsx)$/.test(name) ? [path] : []
  })
}

describe('tr', () => {
  it('shows Arabic as written and fills in values', () => {
    expect(tr('لوحة التحكم')).toBe('لوحة التحكم')
    expect(tr('{0} عارض', [5])).toBe('5 عارض')
    expect(tr(null)).toBe('')
    expect(tr(12)).toBe(12)
  })
})

describe('English dictionary', () => {
  it('has an English line for every tr() text in the code', () => {
    const missing = []
    for (const file of files(SRC)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/\btr\('((?:[^'\\]|\\.)*)'/g)) {
        const key = m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\')
        if (/[؀-ۿ]/.test(key) && !(key in EN)) missing.push(`${file.replace(SRC, 'src')}: ${key}`)
      }
    }
    expect(missing).toEqual([])
  })
})
