// Edge Function: borra a un alumno (su cuenta de acceso y, en cascada, su perfil).
// Borrar usuarios requiere la clave de servicio, que solo existe en el servidor.
// Protecciones: no se puede borrar a un administrador ni a uno mismo.
// Solo admins.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { CORS, json, requireAdmin, serviceKey } from "../_shared/admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;

  let userId: unknown;
  try {
    ({ user_id: userId } = await req.json());
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }
  if (typeof userId !== "string" || userId.length === 0) return json({ error: "Falta user_id" }, 400);
  if (userId === admin.userId) return json({ error: "No puedes borrarte a ti mismo" }, 400);

  const service = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey()!);

  const { data: perfil } = await service
    .from("perfiles")
    .select("es_admin")
    .eq("id", userId)
    .maybeSingle();
  if (perfil?.es_admin) {
    return json({ error: "No se puede borrar a un administrador. Quítale antes el permiso de admin." }, 409);
  }

  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) {
    if (/not found/i.test(error.message)) return json({ ok: true }); // ya no existe
    return json({ error: "No se pudo borrar al alumno" }, 500);
  }

  // perfiles.id tiene "on delete cascade", así que su perfil desaparece con la cuenta.
  return json({ ok: true });
});
