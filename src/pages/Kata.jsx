import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { beltOf } from '../belts.js'

export default function Kata() {
  const { id } = useParams()
  const [kata, setKata] = useState(null)
  const [next, setNext] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [state, setState] = useState('loading') // 'loading' | 'ok' | 'denied' | 'error'

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setVideoUrl(null)

    async function load() {
      // 1) Datos del kata. Si el alumno no tiene cinturón suficiente, RLS no devuelve nada.
      const { data: k, error } = await supabase
        .from('katas')
        .select('id, titulo, descripcion, nivel_minimo, estado')
        .eq('id', id)
        .maybeSingle()
      if (cancelled) return
      if (error) return setState('error')
      if (!k) return setState('denied')
      setKata(k)
      if (k.estado !== 'listo') return setState('notready') // solo lo ven los admins

      // 2) Siguiente kata (de menor a mayor cinturón) entre los que puede ver.
      const { data: lista } = await supabase
        .from('katas')
        .select('id, titulo, nivel_minimo, orden')
        .order('nivel_minimo', { ascending: true })
        .order('orden', { ascending: true })
      if (cancelled) return
      const i = (lista ?? []).findIndex((x) => x.id === id)
      setNext(i >= 0 ? lista[i + 1] ?? null : null)

      // 3) URL firmada del vídeo (la clave de Bunny nunca sale del servidor).
      const { data: vid, error: fnError } = await supabase.functions.invoke('video-url', {
        body: { kata_id: id },
      })
      if (cancelled) return
      if (fnError || !vid?.url) return setState('error')
      setVideoUrl(vid.url)
      setState('ok')
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const belt = kata ? beltOf(kata.nivel_minimo) : null

  return (
    <div className="screen">
      <header className="topbar">
        <Link to="/" className="back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Mis katas
        </Link>
        <div className="accent-bar" />
      </header>

      <div className="player">
        {videoUrl ? (
          <iframe
            src={videoUrl}
            title={kata?.titulo ?? 'Vídeo del kata'}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <div className="player-placeholder" aria-busy={state === 'loading'}>
            {state === 'loading' && 'Cargando vídeo…'}
            {state === 'notready' &&
              (kata?.estado === 'error'
                ? 'Hay un error en este vídeo. Bórralo y súbelo de nuevo.'
                : 'El vídeo se está procesando. Solo lo ves tú, como administrador.')}
          </div>
        )}
      </div>

      <main className="content">
        {state === 'denied' && (
          <p role="alert" className="error">Este kata no está disponible para tu cinturón.</p>
        )}
        {state === 'error' && (
          <p role="alert" className="error">No hemos podido cargar el vídeo. Comprueba tu conexión e inténtalo de nuevo.</p>
        )}

        {kata && (
          <>
            <p className="chip">
              <span className="dot" style={{ background: belt.color, borderColor: belt.borde }} />
              Cinturón {belt.nombre.toLowerCase()}
            </p>
            <h1>{kata.titulo}</h1>
            {kata.descripcion && <p className="description">{kata.descripcion}</p>}
          </>
        )}

        {next && (
          <Link to={`/kata/${next.id}`} className="card next-card">
            <span>
              <span className="muted small">Siguiente</span>
              <span className="kata-title">{next.titulo}</span>
            </span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        )}
      </main>
    </div>
  )
}
