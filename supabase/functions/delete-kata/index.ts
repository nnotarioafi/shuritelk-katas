// Edge Function: borra un kata Y su vídeo en Bunny (para no pagar vídeos huérfanos).
// Orden: primero Bunny (un 404 se da por bueno), después la fila. Si algo falla a medias,
// se puede volver a pulsar "Borrar" sin problema.
//
// Secretos: BUNNY_LIBRARY_ID, BUNNY_API_KEY

import { bunnyConfig, CORS, json, requireAdmin } from "../_shared/admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;
  const { supabase } = admin;

  let kataId: string | undefined;
  try {
    ({ kata_id: kataId } = await req.json());
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }
  if (!kataId) return json({ error: "Falta kata_id" }, 400);

  const { data: kata, error: readError } = await supabase
    .from("katas")
    .select("id, bunny_video_id")
    .eq("id", kataId)
    .maybeSingle();
  if (readError) return json({ error: "No se pudo leer el kata" }, 500);
  if (!kata) return json({ ok: true }); // ya no existe

  const bunny = bunnyConfig();
  if (!bunny) return json({ error: "Falta configuración de Bunny en el servidor" }, 500);

  const res = await fetch(
    `https://video.bunnycdn.com/library/${bunny.libraryId}/videos/${encodeURIComponent(kata.bunny_video_id)}`,
    { method: "DELETE", headers: { AccessKey: bunny.apiKey } },
  );
  if (!res.ok && res.status !== 404) {
    return json({ error: "Bunny no pudo borrar el vídeo. El kata no se ha borrado." }, 502);
  }

  const { error: delError } = await supabase.from("katas").delete().eq("id", kataId);
  if (delError) return json({ error: "El vídeo se borró, pero no el kata. Vuelve a intentarlo." }, 500);

  return json({ ok: true });
});
