// Edge Function: genera el CSV de alumnos incluyendo el ÚLTIMO ACCESO de cada uno.
// El último acceso vive en el sistema de autenticación (auth.users), que solo se puede
// leer desde el servidor con la clave de servicio; por eso esto no se puede hacer en la app.
// Solo admins. Los administradores NO salen en el archivo.
//
// Columnas: email;nombre;cinturon;ultimo_acceso;baja
//  - ultimo_acceso: fecha y hora UTC; vacío = nunca ha entrado.
//  - baja: vacía. Escribe "baja" en esa columna para los alumnos que quieras borrar
//    y vuelve a importar el archivo (la app pide confirmación antes de borrar nada).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { CORS, json, requireAdmin, serviceKey } from "../_shared/admin.ts";

// Mismos nombres que src/belts.js (posición = nivel).
const BELT_NAMES = ["", "Blanco", "Amarillo", "Naranja", "Verde", "Azul", "Marrón", "Negro"];

// El separador es ";" para que Excel en español abra bien las columnas.
function cell(value: unknown): string {
  const s = String(value ?? "");
  return /[;",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;

  const service = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey()!);

  const { data: perfiles, error } = await service
    .from("perfiles")
    .select("id, nombre, email, nivel")
    .eq("es_admin", false) // los administradores no se exportan
    .order("nombre", { ascending: true });
  if (error) return json({ error: "No se pudieron leer los alumnos" }, 500);

  // Último acceso de cada usuario (paginado: hasta 20.000 usuarios).
  const lastSignIn = new Map<string, string | null>();
  for (let page = 1; page <= 20; page++) {
    const { data, error: listError } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (listError) return json({ error: "No se pudo leer el último acceso" }, 500);
    for (const user of data.users) lastSignIn.set(user.id, user.last_sign_in_at ?? null);
    if (data.users.length < 1000) break;
  }

  const lines = ["email;nombre;cinturon;ultimo_acceso;baja"];
  for (const p of perfiles ?? []) {
    const iso = lastSignIn.get(p.id);
    const acceso = iso ? iso.slice(0, 16).replace("T", " ") : "";
    lines.push(
      [p.email, p.nombre, BELT_NAMES[p.nivel] ?? p.nivel, acceso, ""].map(cell).join(";"),
    );
  }

  return json({ csv: lines.join("\r\n"), count: perfiles?.length ?? 0 });
});
