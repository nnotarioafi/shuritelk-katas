// Edge Function: da de alta a un alumno (crea su usuario ya confirmado y fija su cinturón).
// Crear usuarios requiere la service_role, que solo existe en el servidor.
// La clave de servicio la inyecta Supabase automáticamente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { CORS, json, requireAdmin, serviceKey } from "../_shared/admin.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;

  let body: { email?: string; nombre?: string; nivel?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const nombre = String(body.nombre ?? "").trim().slice(0, 100);
  const nivel = Number(body.nivel ?? 1);
  if (!EMAIL_RE.test(email)) return json({ error: "El correo no es válido" }, 400);
  if (!Number.isInteger(nivel) || nivel < 1 || nivel > 7) return json({ error: "Cinturón no válido" }, 400);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey()!,
  );

  const { data, error } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: nombre ? { nombre } : {},
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return json({ error: "Ya existe un alumno con ese correo" }, 409);
    }
    return json({ error: "No se pudo crear el alumno" }, 500);
  }

  // El trigger ya creó el perfil con cinturón blanco: fijamos el cinturón elegido.
  const { error: updError } = await service.from("perfiles").update({ nivel }).eq("id", data.user.id);
  if (updError) return json({ error: "Alumno creado, pero no se pudo fijar su cinturón" }, 500);

  return json({ ok: true, id: data.user.id });
});
