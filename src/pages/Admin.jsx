import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import AdminAlumnos from './AdminAlumnos.jsx'
import AdminKatas from './AdminKatas.jsx'

export default function Admin({ session }) {
  const [isAdmin, setIsAdmin] = useState(undefined)
  const [tab, setTab] = useState('alumnos')

  useEffect(() => {
    supabase
      .from('perfiles')
      .select('es_admin')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setIsAdmin(data?.es_admin === true))
  }, [session.user.id])

  if (isAdmin === undefined) return <div className="splash" aria-busy="true">Cargando…</div>
  // Esto solo oculta la pantalla: la seguridad real la ponen RLS y las Edge Functions.
  if (!isAdmin) return <Navigate to="/" replace />

  return (
    <div className="screen">
      <header className="topbar">
        <Link to="/" className="back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Mis katas
        </Link>
        <h1 className="admin-title">Administración</h1>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'alumnos'} className="tab" onClick={() => setTab('alumnos')}>
            Alumnos
          </button>
          <button role="tab" aria-selected={tab === 'katas'} className="tab" onClick={() => setTab('katas')}>
            Katas
          </button>
        </div>
      </header>

      <main className="content">
        {tab === 'alumnos' ? <AdminAlumnos /> : <AdminKatas />}
      </main>
    </div>
  )
}
