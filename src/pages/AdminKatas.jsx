import { useEffect, useState } from 'react'
import * as tus from 'tus-js-client'
import { supabase } from '../supabase.js'
import { callFunction } from '../api.js'
import { BELTS, beltOf } from '../belts.js'

// Sube el archivo directamente a Bunny con TUS (reanuda solo si se corta la conexión un rato).
function uploadToBunny(file, creds, onProgress) {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: 'https://video.bunnycdn.com/tusupload',
      retryDelays: [0, 3000, 5000, 10000, 20000, 60000],
      headers: {
        AuthorizationSignature: creds.signature,
        AuthorizationExpire: String(creds.expirationTime),
        VideoId: creds.videoId,
        LibraryId: String(creds.libraryId),
      },
      metadata: { filetype: file.type, title: file.name },
      storeFingerprintForResuming: false,
      onError: () => reject(new Error('No se pudo subir el vídeo. Comprueba la conexión e inténtalo de nuevo.')),
      onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
      onSuccess: () => resolve(),
    })
    upload.start()
  })
}

export default function AdminKatas() {
  const [katas, setKatas] = useState([])
  const [state, setState] = useState('loading')
  const [editing, setEditing] = useState(null) // null | 'new' | objeto kata
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  async function load() {
    const { data, error } = await supabase
      .from('katas')
      .select('id, titulo, descripcion, nivel_minimo, orden')
      .order('nivel_minimo', { ascending: false })
      .order('orden', { ascending: true })
    if (error) return setState('error')
    setKatas(data ?? [])
    setState('ok')
  }
  useEffect(() => { load() }, [])

  async function remove(kata) {
    const ok = window.confirm(`¿Borrar «${kata.titulo}»? También se borra su vídeo y no se puede deshacer.`)
    if (!ok) return
    setError('')
    setNotice('')
    setBusyId(kata.id)
    try {
      await callFunction('delete-kata', { kata_id: kata.id })
      setNotice('Kata borrado.')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (editing) {
    return (
      <KataForm
        kata={editing === 'new' ? null : editing}
        onCancel={() => setEditing(null)}
        onDone={(message) => { setEditing(null); setNotice(message); load() }}
      />
    )
  }

  return (
    <>
      <div className="toolbar">
        <button className="btn btn-primary btn-wide" onClick={() => { setNotice(''); setEditing('new') }}>
          + Nuevo kata
        </button>
      </div>

      {notice && <p role="status" className="notice">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {state === 'loading' && <p className="muted" aria-busy="true">Cargando katas…</p>}
      {state === 'error' && <p role="alert" className="error">No se pudieron cargar los katas.</p>}
      {state === 'ok' && katas.length === 0 && <p className="muted">Todavía no hay katas. Añade el primero.</p>}

      <div className="list">
        {katas.map((k) => {
          const belt = beltOf(k.nivel_minimo)
          return (
            <div key={k.id} className="card row-card">
              <div className="row-main">
                <div className="row-title">{k.titulo}</div>
                <div className="muted small-text row-belt">
                  <span className="dot dot-small" style={{ background: belt.color, borderColor: belt.borde }} />
                  {belt.nombre}
                </div>
              </div>
              <div className="row-actions">
                <button className="btn btn-small btn-secondary" onClick={() => { setNotice(''); setEditing(k) }} disabled={busyId === k.id}>
                  Editar
                </button>
                <button className="btn btn-small btn-danger" onClick={() => remove(k)} disabled={busyId === k.id}>
                  {busyId === k.id ? 'Borrando…' : 'Borrar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function KataForm({ kata, onCancel, onDone }) {
  const isNew = !kata
  const [titulo, setTitulo] = useState(kata?.titulo ?? '')
  const [descripcion, setDescripcion] = useState(kata?.descripcion ?? '')
  const [nivel, setNivel] = useState(kata?.nivel_minimo ?? 1)
  const [orden, setOrden] = useState(kata?.orden ?? 0)
  const [file, setFile] = useState(null)
  const [phase, setPhase] = useState('idle') // 'idle' | 'uploading' | 'saving'
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const fields = () => ({
    titulo: titulo.trim(),
    descripcion: descripcion.trim() || null,
    nivel_minimo: Number(nivel),
    orden: Number(orden) || 0,
  })

  async function submit(e) {
    e.preventDefault()
    setError('')

    if (!isNew) {
      setPhase('saving')
      const { error } = await supabase.from('katas').update(fields()).eq('id', kata.id)
      if (error) {
        setPhase('idle')
        return setError('No se pudieron guardar los cambios.')
      }
      return onDone('Cambios guardados.')
    }

    if (!file) return setError('Elige el vídeo del kata.')

    setPhase('uploading')
    setProgress(0)
    // Mantiene la pantalla encendida mientras sube (si el móvil lo permite).
    let wakeLock = null
    try { wakeLock = await navigator.wakeLock?.request('screen') } catch { /* no pasa nada */ }

    try {
      const creds = await callFunction('upload-credentials', { title: titulo.trim() })
      await uploadToBunny(file, creds, setProgress)

      setPhase('saving')
      const { error } = await supabase.from('katas').insert({ ...fields(), bunny_video_id: creds.videoId })
      if (error) {
        throw new Error(
          `El vídeo se subió, pero no se pudo guardar el kata. Id del vídeo en Bunny: ${creds.videoId}`,
        )
      }
      onDone('Kata creado. Bunny está procesando el vídeo: en unos minutos estará listo para los alumnos.')
    } catch (err) {
      setError(err.message)
      setPhase('idle')
    } finally {
      try { wakeLock?.release() } catch { /* nada */ }
    }
  }

  const busy = phase !== 'idle'

  return (
    <form className="card form" onSubmit={submit}>
      <h2 className="form-title">{isNew ? 'Nuevo kata' : 'Editar kata'}</h2>

      <label className="field">
        <span>Título</span>
        <input required value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={busy} />
      </label>

      <label className="field">
        <span>Descripción</span>
        <textarea rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={busy} />
      </label>

      <div className="two-cols">
        <label className="field">
          <span>Cinturón mínimo</span>
          <select className="select select-full" value={nivel} onChange={(e) => setNivel(e.target.value)} disabled={busy}>
            {BELTS.map((b) => <option key={b.nivel} value={b.nivel}>{b.nombre}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Orden</span>
          <input type="number" inputMode="numeric" value={orden} onChange={(e) => setOrden(e.target.value)} disabled={busy} />
        </label>
      </div>

      {isNew ? (
        <label className="field">
          <span>Vídeo</span>
          <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
          <span className="muted small-text">Mejor en horizontal (16:9) para que se vea bien a pantalla completa.</span>
        </label>
      ) : (
        <p className="muted small-text">
          El vídeo no se puede cambiar desde aquí. Si hay que sustituirlo, borra el kata y créalo de nuevo.
        </p>
      )}

      {phase === 'uploading' && (
        <div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Progreso de la subida">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <p className="muted small-text">
            Subiendo… {progress}%. No cierres la app ni apagues la pantalla hasta que termine.
          </p>
        </div>
      )}

      {error && <p role="alert" className="error">{error}</p>}

      <button className="btn btn-primary" disabled={busy || !titulo.trim()}>
        {phase === 'uploading' ? 'Subiendo…' : phase === 'saving' ? 'Guardando…' : isNew ? 'Subir y crear kata' : 'Guardar cambios'}
      </button>
      <button type="button" className="btn-link" onClick={onCancel} disabled={busy}>Cancelar</button>
    </form>
  )
}
