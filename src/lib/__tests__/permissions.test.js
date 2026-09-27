import { describe, expect, it } from 'vitest'
import { can, ROLES } from '../permissions.js'

describe('role permissions', () => {
  it('lets marketing see money but not change it', () => {
    expect(can('marketing', 'payments.write')).toBe(false)
    expect(can('marketing', 'finance.internal')).toBe(false)
    expect(can('marketing', 'reports.view')).toBe(false)
    expect(can('marketing', 'exhibitions.manage')).toBe(false)
    expect(can('marketing', 'records.delete')).toBe(false)
    expect(can('marketing', 'staff.manage')).toBe(false)
  })

  it('gives finance everything except staff management', () => {
    for (const p of ['payments.write', 'finance.internal', 'reports.view', 'exhibitions.manage', 'records.delete']) {
      expect(can('finance', p)).toBe(true)
    }
    expect(can('finance', 'staff.manage')).toBe(false)
  })

  it('gives admin everything and nobody else anything', () => {
    expect(can('admin', 'staff.manage')).toBe(true)
    expect(can(null, 'reports.view')).toBe(false)
    expect(can('admin', 'unknown.permission')).toBe(false)
    expect(Object.keys(ROLES)).toEqual(['admin', 'finance', 'marketing'])
  })
})

describe('amounts are for admin and finance only', () => {
  it('hides income and amounts from marketing', async () => {
    const { can } = await import('../permissions.js')
    expect(can('admin', 'money.view')).toBe(true)
    expect(can('finance', 'money.view')).toBe(true)
    expect(can('marketing', 'money.view')).toBe(false)
  })
})
