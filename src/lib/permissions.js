// Who may do what. The database enforces the same rules (supabase/migrations/003);
// this only decides what each person sees in the interface.

export const ROLES = {
  admin: { label: 'مدير', desc: 'كل الصلاحيات، وإدارة الموظفين' },
  finance: { label: 'مالية', desc: 'كل شيء عدا إدارة الموظفين' },
  viewer: { label: 'مطّلع', desc: 'إداري يطّلع على أحوال الشركة كلها (المالية، التقارير، المصروفات، المعارض، العملاء) دون أي إضافة أو تعديل أو حذف' },
  marketing: { label: 'تسويق', desc: 'تسجيل المشاركين وإصدار الفاتورة، بيانات المشاركين والعملاء، المعارض والمواقع، واتساب — بدون الإجماليات والمبالغ' },
}

const MATRIX = {
  'staff.manage': ['admin'],
  'records.edit.any': ['admin', 'finance'], // edit participants/clients entered by anyone
  'records.viewAll': ['admin', 'finance', 'viewer'], // see every employee's clients and expense claims
  'reports.view': ['admin', 'finance', 'viewer'],
  'payments.write': ['admin', 'finance'], // record / edit / delete / confirm payments and refunds (marketing's wait for confirmation)
  'exhibitions.manage': ['admin', 'finance'], // create/edit/delete exhibitions, build site maps, import Excel
  'money.view': ['admin', 'finance', 'viewer'], // income, totals, contract values, payments — marketing sees names and operations only
  'expenses.review': ['admin', 'finance'], // approve / reject / reimburse expense claims
  'data.write': ['admin', 'finance', 'marketing'], // add / edit anything — the viewer only looks
  'finance.internal': ['admin', 'finance', 'viewer'], // see expenses, sponsors, net results, backup
  'records.delete': ['admin', 'finance'], // delete clients, exhibitors, bookings
}

export const can = (role, permission) => Boolean(role && MATRIX[permission]?.includes(role))

/**
 * Who may edit a participant (or client): admin/finance any; a marketer only the ones they
 * entered themselves, so marketers never overwrite each other's work (migration 009).
 */
export function canEditRecord(role, userId, record) {
  if (can(role, 'records.edit.any')) return true
  return Boolean(can(role, 'data.write') && userId && record?.created_by && record.created_by === userId)
}
