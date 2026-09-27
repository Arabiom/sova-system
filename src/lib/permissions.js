// Who may do what. The database enforces the same rules (supabase/migrations/003);
// this only decides what each person sees in the interface.

export const ROLES = {
  admin: { label: 'مدير', desc: 'كل الصلاحيات، وإدارة الموظفين' },
  finance: { label: 'مالية', desc: 'كل شيء عدا إدارة الموظفين' },
  marketing: { label: 'تسويق', desc: 'العملاء، المعارض، حجز المواقع، المشاركون ومبالغهم، عرض المدفوعات، واتساب' },
}

const MATRIX = {
  'staff.manage': ['admin'],
  'reports.view': ['admin', 'finance'],
  'payments.write': ['admin', 'finance'], // record / edit / delete payments and refunds
  'exhibitions.manage': ['admin', 'finance'], // create/edit/delete exhibitions, build site maps, import Excel
  'finance.internal': ['admin', 'finance'], // expenses, sponsors, net results, backup
  'records.delete': ['admin', 'finance'], // delete clients, exhibitors, bookings
}

export const can = (role, permission) => Boolean(role && MATRIX[permission]?.includes(role))
