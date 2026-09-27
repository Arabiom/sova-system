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
    expect(Object.keys(ROLES)).toEqual(['admin', 'finance', 'viewer', 'marketing'])
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

describe('marketers edit only what they entered', () => {
  it('lets admin/finance edit any record and a marketer only their own', async () => {
    const { canEditRecord } = await import('../permissions.js')
    const mine = { created_by: 'm1' }
    const theirs = { created_by: 'm2' }
    const old = { created_by: null }
    expect(canEditRecord('marketing', 'm1', mine)).toBe(true)
    expect(canEditRecord('marketing', 'm1', theirs)).toBe(false)
    expect(canEditRecord('marketing', 'm1', old)).toBe(false)
    expect(canEditRecord('admin', 'a', theirs)).toBe(true)
    expect(canEditRecord('finance', 'f', old)).toBe(true)
    expect(canEditRecord(null, 'm1', mine)).toBe(false)
  })
})

describe('viewer (مطّلع)', () => {
  it('sees the whole company but changes nothing', async () => {
    const { can, canEditRecord, ROLES } = await import('../permissions.js')
    expect(ROLES.viewer.label).toBe('مطّلع')
    for (const p of ['money.view', 'reports.view', 'finance.internal', 'records.viewAll']) expect(can('viewer', p)).toBe(true)
    for (const p of ['data.write', 'payments.write', 'exhibitions.manage', 'expenses.review', 'records.delete', 'records.edit.any', 'staff.manage']) {
      expect(can('viewer', p)).toBe(false)
    }
    expect(canEditRecord('viewer', 'v', { created_by: 'v' })).toBe(false)
    expect(can('marketing', 'data.write')).toBe(true)
  })
})
