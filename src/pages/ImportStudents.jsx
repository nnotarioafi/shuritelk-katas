import { useMemo, useState } from 'react'
import { supabase } from '../supabase.js'
import { callFunction } from '../api.js'
import { beltOf } from '../belts.js'
import { parseStudents } from '../csv.js'

const MAX_ROWS = 1000
const PREVIEW_ROWS = 100

// Decide qué hay que hacer con cada fila: crear, actualizar, nada o error.
function buildPlan(text, existing) {
  const parsed = parseStudents(text)
  const byEmail = new Map(existing.map((a) => [String(a.email ?? '').toLowerCase(), a]))

  const rows = parsed.map((r) => {
    if (r.error) return { ...r, action: 'error' }
    const found = byEmail.get(r.email)

    if (r.baja) {
      if (!found) return { ...r, action: 'error', error: 'No hay ningún alumno con ese correo' }
      if (found.es_admin) return { ...r, action: 'error', error: 'Es administrador: no se puede borrar' }
      return { ...r, action: 'baja', id: found.id, before: found }
    }

    if (!found) return { ...r, action: 'nuevo' }

    const changes = {}
    if (r.nivel !== null && r.nivel !== found.nivel) changes.nivel = r.nivel
    if (r.nombre && r.nombre !== found.nombre) changes.nombre = r.nombre
    if (Object.keys(changes).length === 0) return { ...r, action: 'igual', id: found.id }
    return { ...r, action: 'actualizar', id: found.id, changes, before: found }
  })

  const count = (a) => rows.filter((r) => r.action === a).length
  return {
    rows,
    tooMany: rows.length > MAX_ROWS,
    counts: {
      nuevo: count('nuevo'),
      actualizar: count('actualizar'),
      igual: count('igual'),
      baja: count('baja'),
      error: count('error'),
    },
  }
}

function describe(row) {
  if (row.action === 'nuevo') return { tag: 'tag-new', text: `Nuevo · ${beltOf(row.nivel ?? 1).nombre}` }
  if (row.action === 'baja') return { tag: 'tag-delete', text: 'BORRAR alumno' }
  if (row.action === 'igual') return { tag: 'tag-same', text: 'Sin cambios' }
  if (row.action === 'error') return { tag: 'tag-error', text: row.error }
  const parts = []
  if (row.changes.nivel) parts.push(`${beltOf(row.before.nivel).nombre} → ${beltOf(row.changes.nivel).nombre}`)
  if (row.changes.nombre) parts.push('nombre')
  return { tag: 'tag-update', text: `Actualizar · ${parts.join(', ')}` }
}

export default function ImportStudents({ existing, onDone, onClose }) {
  const [text, setText] = useState('')
  const [phase, setPhase] = useState('edit') // 'edit' | 'running' | 'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [failures, setFailures] = useState([])
  const [okCount, setOkCount] = useState(0)

  const plan = useMemo(() => buildPlan(text, existing), [text, existing])
  // Los borrados van al final, después de crear y actualizar.
  const todo = plan.rows
    .filter((r) => ['nuevo', 'actualizar', 'baja'].includes(r.action))
    .sort((a, b) => (a.action === 'baja') - (b.action === 'baja'))

  async function readFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setText(await file.text())
  }

  async function apply() {
    if (todo.length === 0 || plan.tooMany) return
    const { nuevo, actualizar, baja } = plan.counts
    const ok = window.confirm(
      `Se crearán ${nuevo} alumnos, se actualizarán ${actualizar}` +
        (baja > 0 ? ` y se BORRARÁN ${baja}` : '') +
        '. ¿Continuar?',
    )
    if (!ok) return
    if (baja > 0) {
      const typed = window.prompt(
        `Vas a BORRAR ${baja} alumnos: se elimina su cuenta y su cinturón, y no se puede deshacer.\n\nEscribe BORRAR para confirmar.`,
      )
      if (typed !== 'BORRAR') return
    }

    setPhase('running')
    setProgress({ done: 0, total: todo.length })
    const fails = []
    let okN = 0
    let done = 0
    let next = 0

    async function worker() {
      while (next < todo.length) {
        const row = todo[next++]
        try {
          if (row.action === 'nuevo') {
            await callFunction('create-student', { email: row.email, nombre: row.nombre, nivel: row.nivel ?? 1 })
          } else if (row.action === 'baja') {
            await callFunction('delete-student', { user_id: row.id })
          } else {
            const { error } = await supabase.from('perfiles').update(row.changes).eq('id', row.id)
            if (error) throw new Error('No se pudo actualizar')
          }
          okN++
        } catch (err) {
          fails.push({ email: row.email, message: err.message })
        }
        done++
        setProgress({ done, total: todo.length })
      }
    }
    await Promise.all([worker(), worker(), worker()])

    setOkCount(okN)
    setFailures(fails)
    setPhase('done')
    onDone()
  }

  if (phase === 'done') {
    return (
      <div className="card form">
        <h2 className="form-title">Importación terminada</h2>
        <p role="status" className="notice">{okCount} cambios aplicados.</p>
        {failures.length > 0 && (
          <div>
            <p role="alert" className="error">{failures.length} no se pudieron aplicar:</p>
            <ul className="fail-list">
              {failures.map((f) => <li key={f.email}>{f.email}: {f.message}</li>)}
            </ul>
          </div>
        )}
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </div>
    )
  }

  const busy = phase === 'running'

  return (
    <div className="card form">
      <h2 className="form-title">Importar o actualizar alumnos</h2>
      <p className="muted small-text">
        Copia las filas desde Excel y pégalas aquí, o sube un archivo CSV. Columnas: <b>correo</b>, <b>nombre</b> y{' '}
        <b>cinturón</b> (nombre o número del 1 al 7). Si el correo ya existe, se actualiza su cinturón; si no, se
        crea el alumno. Los alumnos nuevos no reciben ningún correo hasta que ellos mismos piden su código.
      </p>
      <p className="muted small-text">
        <b>Para borrar alumnos:</b> usa un archivo con cabecera (como el que baja «Descargar CSV») y escribe{' '}
        <b>baja</b> en la columna «baja» de cada fila. Antes de borrar se pedirá confirmación. No se puede borrar a
        los administradores.
      </p>

      <label className="field">
        <span>Filas pegadas desde Excel</span>
        <textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          placeholder={'ana@correo.com\tAna Pérez\tNaranja\nluis@correo.com\tLuis Gómez\tBlanco'}
        />
      </label>

      <label className="field">
        <span>…o un archivo CSV</span>
        <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={readFile} disabled={busy} />
      </label>

      {plan.rows.length > 0 && (
        <>
          <p className="small-text">
            <b>{plan.counts.nuevo}</b> nuevos · <b>{plan.counts.actualizar}</b> a actualizar ·{' '}
            <b>{plan.counts.igual}</b> sin cambios
            {plan.counts.baja > 0 && <> · <b>{plan.counts.baja}</b> a borrar</>} · <b>{plan.counts.error}</b> con errores
          </p>
          {plan.tooMany && (
            <p role="alert" className="error">Hay más de {MAX_ROWS} filas. Divide la lista en varias partes.</p>
          )}
          <div className="preview">
            {plan.rows.slice(0, PREVIEW_ROWS).map((row) => {
              const d = describe(row)
              return (
                <div key={`${row.line}-${row.email}`} className="preview-row">
                  <div className="row-main">
                    <div className="row-title">{row.email || '(sin correo)'}</div>
                    {row.nombre && <div className="muted small-text">{row.nombre}</div>}
                  </div>
                  <span className={`tag ${d.tag}`}>{d.text}</span>
                </div>
              )
            })}
          </div>
          {plan.rows.length > PREVIEW_ROWS && (
            <p className="muted small-text">Se muestran las primeras {PREVIEW_ROWS} de {plan.rows.length} filas.</p>
          )}
        </>
      )}

      {busy && (
        <div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="Progreso de la importación">
            <div className="progress-bar" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
          </div>
          <p className="muted small-text">Aplicando… {progress.done} de {progress.total}. No cierres esta pantalla.</p>
        </div>
      )}

      <button className="btn btn-primary" onClick={apply} disabled={busy || todo.length === 0 || plan.tooMany}>
        {busy ? 'Aplicando…' : todo.length > 0 ? `Aplicar ${todo.length} cambios` : 'Nada que aplicar'}
      </button>
      <button type="button" className="btn-link" onClick={onClose} disabled={busy}>Cancelar</button>
    </div>
  )
}
