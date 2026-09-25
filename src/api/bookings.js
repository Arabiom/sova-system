import { supabase, unwrap } from './client.js'
import { createExhibitor } from './exhibitors.js'

const table = () => supabase.from('bookings')

export const PENDING = 'معلق'

export const listBookings = () => unwrap(table().select('*').order('created_at', { ascending: false }))

export const countPendingBookings = () =>
  unwrap(table().select('id', { count: 'exact', head: true }).eq('status', PENDING))

/** Accept a booking: create a provisional exhibitor from it, then mark the booking accepted. */
export async function acceptBooking(booking) {
  await createExhibitor({
    brand: booking.brand,
    manager: booking.manager,
    phone: booking.phone,
    email: booking.email || '',
    category: booking.category || '',
    exhibition_id: booking.exhibition_id,
    booth: '—',
    booth_size: booking.booth_size || '',
    contract: 0,
    paid: 0,
    status: 'مبدئي',
    notes: booking.message || '',
  })
  await unwrap(table().update({ status: 'مقبول' }).eq('id', booking.id))
}

export const rejectBooking = (id) => unwrap(table().update({ status: 'مرفوض' }).eq('id', id))

/** Call `onChange` whenever any booking row changes. Returns an unsubscribe function. */
export function watchBookings(onChange) {
  const channel = supabase
    .channel('bookings-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, onChange)
    .subscribe()
  return () => supabase.removeChannel(channel)
}
