import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './supabase.js'
import Login from './pages/Login.jsx'
import Katas from './pages/Katas.jsx'
import Kata from './pages/Kata.jsx'
import Admin from './pages/Admin.jsx'

export default function App() {
  // undefined = todavía comprobando la sesión, null = sin sesión
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="splash" aria-busy="true">Cargando…</div>

  if (!session) return <Login />

  return (
    <Routes>
      <Route path="/" element={<Katas session={session} />} />
      <Route path="/kata/:id" element={<Kata />} />
      <Route path="/admin" element={<Admin session={session} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
