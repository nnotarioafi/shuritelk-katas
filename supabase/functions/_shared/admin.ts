// Utilidades compartidas por las funciones de administración.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Supabase inyecta las claves con nombres antiguos (SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
// y nuevos (SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS, un JSON con la clave "default").
// Se aceptan ambos para que funcione en proyectos antiguos y nuevos.
function envKey(legacyName: string, jsonName: string): string | undefined {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;
  try {
    return JSON.parse(Deno.env.get(jsonName) ?? "{}").default;
  } catch {
    return undefined;
  }
}
export const publicKey = () => envKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
export const serviceKey = () => envKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function sha256Hex(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Comprueba que quien llama es administrador, usando SU sesión (JWT).
// Devuelve un cliente que actúa como ese admin (sujeto a RLS) o una respuesta de error.
export async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: json({ error: "Sin sesión" }, 401) };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    publicKey()!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data, error } = await supabase.rpc("soy_admin");
  if (error) return { error: json({ error: "No se pudieron comprobar los permisos" }, 500) };
  if (data !== true) return { error: json({ error: "Solo los administradores pueden hacer esto" }, 403) };

  // Id de quien llama (para impedir, por ejemplo, que un admin se borre a sí mismo).
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData } = await supabase.auth.getUser(jwt);
  return { supabase, userId: userData?.user?.id ?? null };
}

export function bunnyConfig() {
  const libraryId = Deno.env.get("BUNNY_LIBRARY_ID");
  const apiKey = Deno.env.get("BUNNY_API_KEY");
  if (!libraryId || !apiKey) return null;
  return { libraryId, apiKey };
}
