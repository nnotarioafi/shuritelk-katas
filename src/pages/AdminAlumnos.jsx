import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase.js'
import { callFunction } from '../api.js'
import { BELTS } from '../belts.js'
import ImportStudents from './ImportStudents.jsx'

// Descarga un texto como archivo CSV (con BOM para que Excel respete los acentos).
function downloadCsv(csv) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'alumnos.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function AdminAlumnos() {
  const [alumnos, setAlumnos] = useState([])
  const [state, setState] = useState('loading') // 'loading' | 'ok' | 'error'
  const [query, setQuery] = useState('')
  const [rowError, setRowError] = useState('')
  const [panel, setPanel] = useState(null) // null | 'alta' | 'importar'
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  async function load() {
    const { data, error } = await supabase
      .from('perfiles')
      .select('id, nombre, email, nivel, es_admin')
      .order('nombre', { ascending: true })
    if (error) return setState('error')
    setAlumnos(data ?? [])
    setState('ok')
  }
  useEffect(() => { load() }, [])

  async function changeBelt(alumno, nivel) {
    setRowError('')
    const previous = alumno.nivel
    setAlumnos((list) => list.map((a) => (a.id === alumno.id ? { ...a, nivel } : a)))
    const { error } = await supabase.from('perfiles').update({ nivel }).eq('id', alumno.id)
    if (error) {
      setAlumnos((list) => list.map((a) => (a.id === alumno.id ? { ...a, nivel: previous } : a)))
      setRowError(`No se pudo cambiar el cinturón de ${alumno.nombre ?? alumno.email}.`)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return alumnos
    return alumnos.filter((a) => `${a.nombre ?? ''} ${a.email ?? ''}`.toLowerCase().includes(q))
  }, [alumnos, query])

  const toggle = (name) => setPanel((p) => (p === name ? null : name))

  async function removeStudent(alumno) {
    const who = alumno.nombre || alumno.email
    const ok = window.confirm(
      `¿Borrar a ${who}?\n\nSe elimina su cuenta y su cinturón, y no se puede deshacer.`,
    )
    if (!ok) return
    setRowError('')
    setNotice('')
    setDeletingId(alumno.id)
    try {
      await callFunction('delete-student', { user_id: alumno.id })
      setAlumnos((list) => list.filter((a) => a.id !== alumno.id))
      setNotice(`${who} ha sido borrado.`)
    } catch (err) {
      setRowError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  async function exportCsv() {
    setRowError('')
    setExporting(true)
    try {
      const { csv } = await callFunction('export-students', {})
      downloadCsv(csv)
    } catch (err) {
      setRowError(err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          aria-label="Buscar alumno"
          placeholder="Buscar alumno"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn btn-small btn-primary" onClick={() => toggle('alta')}>
          {panel === 'alta' ? 'Cerrar' : '+ Alta'}
        </button>
      </div>

      <div className="btn-row">
        <button className="btn btn-small btn-secondary" onClick={() => toggle('importar')}>
          {panel === 'importar' ? 'Cerrar importación' : 'Importar desde Excel'}
        </button>
        <button className="btn btn-small btn-secondary" onClick={exportCsv} disabled={exporting || alumnos.length === 0}>
          {exporting ? 'Preparando…' : 'Descargar CSV'}
        </button>
      </div>

      {panel === 'alta' && <NewStudent onCreated={() => { setPanel(null); load() }} />}
      {panel === 'importar' && (
        <ImportStudents existing={alumnos} onDone={load} onClose={() => setPanel(null)} />
      )}

      {notice && <p role="status" className="notice">{notice}</p>}
      {rowError && <p role="alert" className="error">{rowError}</p>}
      {state === 'loading' && <p className="muted" aria-busy="true">Cargando alumnos…</p>}
      {state === 'error' && <p role="alert" className="error">No se pudieron cargar los alumnos.</p>}
      {state === 'ok' && filtered.length === 0 && <p className="muted">No hay alumnos que coincidan.</p>}

      <div className="list">
        {filtered.map((a) => (
          <div key={a.id} className="card row-card">
            <div className="row-main">
              <div className="row-title">{a.nombre || 'Sin nombre'}{a.es_admin ? ' (admin)' : ''}</div>
              <div className="muted small-text">{a.email}</div>
            </div>
            <select
              className="select"
              aria-label={`Cinturón de ${a.nombre ?? a.email}`}
              value={a.nivel}
              onChange={(e) => changeBelt(a, Number(e.target.value))}
              disabled={deletingId === a.id}
            >
              {BELTS.map((b) => (
                <option key={b.nivel} value={b.nivel}>{b.nombre}</option>
              ))}
            </select>
            {!a.es_admin && (
              <button
                className="icon-btn icon-btn-danger"
                aria-label={`Borrar a ${a.nombre || a.email}`}
                title="Borrar alumno"
                onClick={() => removeStudent(a)}
                disabled={deletingId === a.id}
              >
                {deletingId === a.id ? (
                  <span aria-hidden="true">…</span>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                )}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function NewStudent({ onCreated }) {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [nivel, setNivel] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await callFunction('create-student', { email, nombre, nivel })
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2 className="form-title">Dar de alta a un alumno</h2>
      <label className="field">
        <span>Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
      </label>
      <label className="field">
        <span>Correo electrónico</span>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />
      </label>
      <label className="field">
        <span>Cinturón</span>
        <select className="select select-full" value={nivel} onChange={(e) => setNivel(Number(e.target.value))}>
          {BELTS.map((b) => <option key={b.nivel} value={b.nivel}>{b.nombre}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="btn btn-primary" disabled={busy || !email}>
        {busy ? 'Creando…' : 'Dar de alta'}
      </button>
      <p className="muted small-text">
        El alumno ya puede entrar con ese correo: la app le enviará un código cuando lo pida.
      </p>
    </form>
  )
}
