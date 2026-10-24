import { fetchAll, supabase, unwrap } from './client.js'
import { findOrCreateClient } from './clients.js'
import { createExhibitor } from './exhibitors.js'
import { tr } from '../lib/i18n.js'

const table = () => supabase.from('bookings')

export const PENDING = 'معلق'

export const listBookings = () => unwrap(fetchAll(() => table().select('*').order('created_at', { ascending: false })))

/** How many requests are still pending (a head request: the count, no rows). */
export async function countPendingBookings() {
  const { count, error } = await table().select('id', { count: 'exact', head: true }).eq('status', PENDING)
  if (error) throw error
  return count || 0
}

/**
 * Accept a booking: take it first (only while still pending — a second click or a colleague
 * accepting at the same moment adds nothing), then create a provisional exhibitor from it.
 * If that fails the booking is pending again.
 */
export async function acceptBooking(booking) {
  const taken = await unwrap(table().update({ status: 'مقبول' }).eq('id', booking.id).eq('status', PENDING).select('id'))
  if (!taken?.length) throw new Error(tr('هذا الطلب قُبل أو رُفض للتو من زميل — حدّث الصفحة'))
  try {
    const client_id = await findOrCreateClient(booking)
    await createExhibitor({
      client_id,
      brand: booking.brand,
      manager: booking.manager,
      phone: booking.phone,
      email: (booking.email || '').trim().toLowerCase(),
      category: booking.category || '',
      exhibition_id: booking.exhibition_id,
      booth: '—',
      booth_size: booking.booth_size || '',
      contract: 0,
      paid: 0,
      status: 'مبدئي',
      notes: booking.message || '',
    })
  } catch (err) {
    await table().update({ status: PENDING }).eq('id', booking.id)
    throw err
  }
}

/** An inquiry from the public link: answered, nothing to add as an exhibitor. */
export const INQUIRY = 'استفسار'
export const isInquiry = (booking) => booking?.kind === INQUIRY
export const markInquiryAnswered = (id) => unwrap(table().update({ status: 'مقبول' }).eq('id', id))

export const rejectBooking = (id) => unwrap(table().update({ status: 'مرفوض' }).eq('id', id))

/** Call `onChange` whenever any booking row changes. Returns an unsubscribe function. */
export function watchBookings(onChange) {
  const channel = supabase
    .channel('bookings-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, onChange)
    .subscribe()
  return () => supabase.removeChannel(channel)
}
