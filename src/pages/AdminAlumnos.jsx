import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase.js'
import { callFunction } from '../api.js'
import { BELTS } from '../belts.js'

export default function AdminAlumnos() {
  const [alumnos, setAlumnos] = useState([])
  const [state, setState] = useState('loading') // 'loading' | 'ok' | 'error'
  const [query, setQuery] = useState('')
  const [rowError, setRowError] = useState('')
  const [showForm, setShowForm] = useState(false)

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
        <button className="btn btn-small btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cerrar' : '+ Alta'}
        </button>
      </div>

      {showForm && (
        <NewStudent
          onCreated={() => { setShowForm(false); load() }}
        />
      )}

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
            >
              {BELTS.map((b) => (
                <option key={b.nivel} value={b.nivel}>{b.nombre}</option>
              ))}
            </select>
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
