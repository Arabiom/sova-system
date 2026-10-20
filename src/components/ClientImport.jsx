import { useMemo, useState } from 'react'
import { importClients } from '../api/clients.js'
import { useToast } from '../context/ToastContext.jsx'
import { CLIENT_FIELDS, classifyClients, columnOptions, countStates, detectColumns, downloadClientTemplate, IMPORT_STATES, parseCsv, readClientRows } from '../lib/clientImport.js'
import { downloadCsv } from '../lib/csv.js'
import { tr } from '../lib/i18n.js'
import { CONTACT_SOURCES } from '../lib/constants.js'
import { pickSheet, readSheets } from '../lib/importSheet.js'
import Button from './Button.jsx'
import Modal from './Modal.jsx'

const STATE_TONE = { new: 'success', duplicate: 'warning', exists: 'neutral', invalid: 'danger' }

/** Read an .xlsx (every sheet) or .csv file: [{ name, rows }]. */
async function readFile(file) {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return [{ name: file.name, rows: parseCsv(await file.text()) }]
  return readSheets(file)
}

/** Rows shown at once — a list of thousands is reviewed by its totals and tabs, not row by row. */
const SHOWN = 300

/**
 * Import clients from a file: pick the file, check the columns, review every row (new, repeated
 * in the file, already in the database, incomplete), then save the ticked ones.
 */
export default function ClientImport({ existing, onClose, onDone }) {
  const toast = useToast()
  const [sheet, setSheet] = useState(null) // { name, rows, headerRow, sheets, index }
  const [numberSource, setNumberSource] = useState('')
  const [cols, setCols] = useState({})
  const [picked, setPicked] = useState({}) // line → include (overrides the default)
  const [show, setShow] = useState('all')
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)

  const choose = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const sheets = (await readFile(file)).filter((s) => s.rows.length)
      if (!sheets.length) return toast(tr('الملف فارغ'), 'error')
      openSheet({ name: file.name, sheets }, pickSheet(sheets, detectColumns))
    } catch (err) {
      toast(tr('تعذّر قراءة الملف: {0}', [err.message]), 'error')
    }
  }

  /** Read one sheet of the workbook (the one with the data is chosen first). */
  function openSheet(book, index) {
    const { rows } = book.sheets[index]
    const found = detectColumns(rows)
    setSheet({ ...book, index, rows, headerRow: found.headerRow })
    setCols(found.cols)
    setPicked({})
    if (found.headerRow < 0) toast(tr('لم أتعرف على أسماء الأعمدة — اختر عمود كل حقل بالأسفل'), 'warn')
  }

  const rows = useMemo(() => (sheet ? classifyClients(readClientRows(sheet.rows, sheet.headerRow, cols), existing) : []), [sheet, cols, existing])
  const included = (r) => (r.line in picked ? picked[r.line] : r.include)
  const chosen = rows.filter((r) => included(r) && r.state !== 'invalid')
  const counts = countStates(rows)
  const visible = show === 'all' ? rows : rows.filter((r) => r.state === show)
  const options = sheet ? columnOptions(sheet.rows, sheet.headerRow) : []

  const setCol = (key) => (e) => {
    const value = e.target.value === '' ? undefined : +e.target.value
    setCols((c) => {
      const next = { ...c }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })
  }

  const save = async () => {
    if (!chosen.length) return toast(tr('لم تختر أي عميل للإضافة'), 'error')
    if (cols.name === undefined && cols.contact_name === undefined) return toast(tr('اختر عمود اسم المشروع أو اسم المسؤول'), 'error')
    setProgress(0)
    try {
      const outcome = await importClients(numberSource ? chosen.map((r) => ({ ...r, contact_source: numberSource })) : chosen, (done) => setProgress(done))
      setResult(outcome)
      onDone()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setProgress(null)
    }
  }

  const exportReport = () =>
    downloadCsv(`${tr('تقرير-استيراد-العملاء')}.csv`, rows, [
      { label: tr('السطر'), value: (r) => r.line },
      { label: tr('اسم المشروع / العلامة'), value: (r) => r.name },
      { label: tr('اسم المسؤول'), value: (r) => r.contact_name },
      { label: tr('الهاتف'), value: (r) => r.phone },
      { label: tr('النتيجة'), value: (r) => tr(IMPORT_STATES[r.state]) },
      { label: tr('السبب'), value: (r) => [r.reason, ...r.warnings].filter(Boolean).join(' • ') },
      { label: tr('أُضيف'), value: (r) => (included(r) && r.state !== 'invalid' ? tr('نعم') : tr('لا')) },
    ])

  if (result) {
    return (
      <Modal title={tr('📥 نتيجة الاستيراد')} onClose={onClose} size="lg" footer={<Button onClick={onClose}>{tr('تم ✓')}</Button>}>
        <div className="import-result">
          <div className="import-result-big text-suc">✅ {tr('أُضيف {0} عميل', [result.added])}</div>
          {result.failed.length > 0 && <div className="text-dng strong">{tr('⛔ رُفض {0} — التفاصيل بالأسفل', [result.failed.length])}</div>}
        </div>
        {result.failed.length > 0 && (
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>{tr('السطر')}</th>
                  <th>{tr('العميل')}</th>
                  <th>{tr('السبب')}</th>
                </tr>
              </thead>
              <tbody>
                {result.failed.map(({ row, message }) => (
                  <tr key={row.line}>
                    <td className="num">{row.line}</td>
                    <td className="strong">{row.name}</td>
                    <td className="small text-dng">{tr(message)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      title={tr('📥 استيراد عملاء من ملف')}
      subtitle={sheet ? tr('{0} — {1} سطر', [sheet.name, rows.length]) : tr('ملف Excel ‏(.xlsx) أو CSV، فيه عمود لاسم المشروع أو المسؤول وعمود للهاتف')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tr('إلغاء')}
          </Button>
          {sheet && (
            <Button variant="outline" onClick={exportReport}>
              {tr('⬇️ تقرير المراجعة')}
            </Button>
          )}
          <Button onClick={save} disabled={!sheet || progress !== null || !chosen.length}>
            {progress !== null ? tr('جاري الإضافة... {0}/{1}', [progress, chosen.length]) : tr('إضافة {0} عميل', [chosen.length])}
          </Button>
        </>
      }
    >
      <div className="row-actions mb-12">
        <label className="btn btn-outline btn-sm file-pick">
          {sheet ? tr('🔄 اختيار ملف آخر') : tr('📂 اختيار الملف')}
          <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={choose} hidden />
        </label>
        <Button size="sm" variant="ghost" onClick={downloadClientTemplate}>
          {tr('⬇️ نموذج فارغ بالأعمدة')}
        </Button>
      </div>

      {sheet && (
        <>
          {sheet.sheets.length > 1 && (
            <div className="mb-12">
              <div className="field-label">{tr('الورقة — اخترتُ التي فيها البيانات:')}</div>
              <div className="chips-row">
                {sheet.sheets.map((s, i) => (
                  <button key={s.name + i} type="button" className={`chip-btn ${sheet.index === i ? 'active' : ''}`} onClick={() => openSheet(sheet, i)}>
                    {s.name} ({s.rows.length})
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mb-12">
            <label className="field-label" htmlFor="import-number-source">
              {tr('مصدر الأرقام في هذا الملف (لكل الأسطر):')}
            </label>
            <select id="import-number-source" className="input input-compact" value={numberSource} onChange={(e) => setNumberSource(e.target.value)}>
              <option value="">{tr('غير محدد')}</option>
              {CONTACT_SOURCES.map((c) => (
                <option key={c} value={c}>
                  {tr(c)}
                </option>
              ))}
            </select>
            <div className="tiny muted">{tr('يُستخدم في الحملات لمعرفة من وافق على التواصل — قائمة المشاركين السابقين: «عارض سابق»')}</div>
          </div>
          <div className="field-label">{tr('الأعمدة — تأكد أن كل حقل مربوط بالعمود الصحيح:')}</div>
          <div className="import-map mb-12">
            {CLIENT_FIELDS.map((f) => (
              <label key={f.key} className="import-map-item">
                <span>{tr(f.label)}</span>
                <select className="input input-compact" value={cols[f.key] ?? ''} onChange={setCol(f.key)}>
                  <option value="">{tr('— لا يوجد —')}</option>
                  {options.map((o) => (
                    <option key={o.index} value={o.index}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="tabs mb-10">
            <button className={`tab ${show === 'all' ? 'active' : ''}`} onClick={() => setShow('all')}>
              {tr('الكل')} ({rows.length})
            </button>
            {Object.entries(IMPORT_STATES).map(([state, label]) => (
              <button key={state} className={`tab ${show === state ? 'active' : ''}`} onClick={() => setShow(state)}>
                {tr(label)} ({counts[state]})
              </button>
            ))}
          </div>

          <div className="table-wrap import-table">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th></th>
                  <th>{tr('السطر')}</th>
                  <th>{tr('اسم المشروع / العلامة')}</th>
                  <th>{tr('اسم المسؤول')}</th>
                  <th>{tr('الهاتف')}</th>
                  <th>{tr('القطاع')}</th>
                  <th>{tr('المدينة')}</th>
                  <th>{tr('النتيجة')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, SHOWN).map((r) => (
                  <tr key={r.line} className={included(r) && r.state !== 'invalid' ? '' : 'row-muted'}>
                    <td>
                      <input
                        type="checkbox"
                        checked={included(r) && r.state !== 'invalid'}
                        disabled={r.state === 'invalid'}
                        onChange={(e) => setPicked((p) => ({ ...p, [r.line]: e.target.checked }))}
                        aria-label={tr('إضافة')}
                      />
                    </td>
                    <td className="num muted">{r.line}</td>
                    <td className="strong">{r.name || '—'}</td>
                    <td>{r.contact_name || '—'}</td>
                    <td dir="ltr" className="nowrap">{r.phone || '—'}</td>
                    <td className="small">
                      {r.sector || '—'}
                      {r.sectorGuessed && <span title={tr('فُرز تلقائياً — ما كتبه الملف محفوظ في الملاحظات')}> ✨</span>}
                    </td>
                    <td className="small">{r.city || '—'}</td>
                    <td>
                      <span className={`badge badge-${STATE_TONE[r.state]}`}>{tr(IMPORT_STATES[r.state])}</span>
                      {r.reason && <div className="tiny muted">{r.reason}</div>}
                      {r.warnings.map((w) => (
                        <div key={w} className="tiny text-wrn">
                          ⚠️ {w}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length && <div className="empty-inline">{tr('لا توجد أسطر هنا')}</div>}
          {visible.length > SHOWN && <div className="muted tiny mt-10">{tr('يُعرض أول {0} من {1} سطر — كلها تُضاف حسب اختيارك', [SHOWN, visible.length])}</div>}
          <div className="muted tiny mt-10">
            {tr('المكرر والموجود مسبقاً لا يُضاف إلا إذا اخترته بنفسك، وقاعدة البيانات ترفض أي رقم مسجل عند الحفظ. يُسجَّل العملاء باسمك في خانة «أضافه».')}
          </div>
        </>
      )}
    </Modal>
  )
}
