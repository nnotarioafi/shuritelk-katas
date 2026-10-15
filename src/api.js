import { supabase } from './supabase.js'

// Llama a una Edge Function y devuelve los datos, o lanza un Error con el mensaje del servidor.
export async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let message = 'No se pudo completar la acción. Inténtalo de nuevo.'
    try {
      const payload = await error.context.json()
      if (payload?.error) message = payload.error
    } catch {
      /* se queda el mensaje genérico */
    }
    throw new Error(message)
  }
  return data
}
