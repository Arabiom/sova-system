// Company settings (migration 014): VAT registration.

import { COMPANY } from '../lib/constants.js'
import { setVatEnabled } from '../lib/finance.js'
import { supabase, unwrap } from './client.js'

/** Not registered for VAT until the manager says so. */
export const DEFAULT_SETTINGS = { vat_enabled: false, vat_number: '' }

/** Read the settings; before migration 014 (or if unreadable) VAT stays off. */
export async function fetchSettings() {
  const { data, error } = await supabase.from('company_settings').select('vat_enabled,vat_number').eq('id', 1).maybeSingle()
  if (error || !data) return DEFAULT_SETTINGS
  return data
}

/** Apply settings to the calculations and documents. */
export function applySettings(settings) {
  setVatEnabled(Boolean(settings?.vat_enabled))
  COMPANY.vatNumber = settings?.vat_enabled ? settings.vat_number || '' : ''
}

export async function saveSettings(patch) {
  await unwrap(supabase.from('company_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1))
  const settings = await fetchSettings()
  applySettings(settings)
  return settings
}
