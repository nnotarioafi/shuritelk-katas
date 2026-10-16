import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { beltOf } from '../belts.js'

function PlayIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

export default function Katas({ session }) {
  const [perfil, setPerfil] = useState(null)
  const [katas, setKatas] = useState([])
  const [state, setState] = useState('loading') // 'loading' | 'ok' | 'error'

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [p, k] = await Promise.all([
        supabase.from('perfiles').select('nombre, nivel, es_admin').eq('id', session.user.id).maybeSingle(),
        // RLS ya filtra: solo llegan los katas del cinturón del alumno y los inferiores.
        supabase
          .from('katas')
          .select('id, titulo, nivel_minimo, orden, estado')
          .order('nivel_minimo', { ascending: false })
          .order('orden', { ascending: true }),
      ])
      if (cancelled) return
      if (p.error || k.error) return setState('error')
      setPerfil(p.data)
      setKatas(k.data ?? [])
      setState('ok')
    }
    load()
    return () => { cancelled = true }
  }, [session.user.id])

  // Agrupa por cinturón, del más alto al más bajo.
  const groups = useMemo(() => {
    const map = new Map()
    for (const kata of katas) {
      if (!map.has(kata.nivel_minimo)) map.set(kata.nivel_minimo, [])
      map.get(kata.nivel_minimo).push(kata)
    }
    return [...map.entries()].map(([nivel, items]) => ({ belt: beltOf(nivel), items }))
  }, [katas])

  const miCinturon = beltOf(perfil?.nivel ?? 1)

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <img className="topbar-logo" src="/logo.jpg" alt="Shurite-LK Club Deportivo" />
          <button className="icon-btn" aria-label="Cerrar sesión" onClick={() => supabase.auth.signOut()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </div>
        <div className="accent-bar" />
      </header>

      <main className="content">
        <h1>Hola{perfil?.nombre ? `, ${perfil.nombre}` : ''}</h1>
        {perfil && (
          <p className="chip">
            <span className="dot" style={{ background: miCinturon.color, borderColor: miCinturon.borde }} />
            Cinturón {miCinturon.nombre.toLowerCase()}
          </p>
        )}

        {perfil?.es_admin && (
          <Link to="/admin" className="btn btn-secondary btn-inline">Administrar alumnos y katas</Link>
        )}

        {state === 'loading' && <p className="muted" aria-busy="true">Cargando tus katas…</p>}
        {state === 'error' && (
          <p role="alert" className="error">No hemos podido cargar los katas. Comprueba tu conexión e inténtalo de nuevo.</p>
        )}
        {state === 'ok' && groups.length === 0 && (
          <p className="muted">Todavía no hay katas para tu cinturón. Tu sensei los irá añadiendo.</p>
        )}

        {groups.map(({ belt, items }) => (
          <section key={belt.nivel} className="belt-group">
            <h2>
              <span className="dot" style={{ background: belt.color, borderColor: belt.borde }} />
              {belt.nombre}
            </h2>
            {items.map((k) => (
              <Link key={k.id} to={`/kata/${k.id}`} className="card kata-card">
                <span className="thumb"><PlayIcon /></span>
                <span className="kata-text">
                  <span className="kata-title">{k.titulo}</span>
                  {k.estado === 'procesando' && <span className="tag tag-wait">Procesando · solo lo ves tú</span>}
                  {k.estado === 'error' && <span className="tag tag-error">Error en el vídeo</span>}
                </span>
              </Link>
            ))}
          </section>
        ))}
      </main>
    </div>
  )
}
