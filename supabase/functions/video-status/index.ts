// Edge Function: revisa en Bunny los katas con estado 'procesando' y actualiza su estado.
//   Finished (4) o JitPlaylistsCreated (8)  -> 'listo'
//   Error (5), UploadFailed (6) o 404        -> 'error'
//   cualquier otro                           -> sigue 'procesando'
// La llama la pantalla de administración mientras haya katas procesándose.
// Solo admins. Secretos: BUNNY_LIBRARY_ID, BUNNY_API_KEY

import { bunnyConfig, CORS, json, requireAdmin } from "../_shared/admin.ts";

type Estado = "procesando" | "listo" | "error";

// Códigos del campo "status" de la API de vídeos de Bunny Stream.
function estadoDesdeBunny(status: number): Estado {
  if (status === 4 || status === 8) return "listo";
  if (status === 5 || status === 6) return "error";
  return "procesando";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const bunny = bunnyConfig();
  if (!bunny) return json({ error: "Falta configuración de Bunny en el servidor" }, 500);

  const { data: pendientes, error } = await supabase
    .from("katas")
    .select("id, bunny_video_id")
    .eq("estado", "procesando")
    .limit(50);
  if (error) return json({ error: "No se pudieron leer los katas pendientes" }, 500);

  const resultados = await Promise.all(
    (pendientes ?? []).map(async (kata) => {
      try {
        const res = await fetch(
          `https://video.bunnycdn.com/library/${bunny.libraryId}/videos/${encodeURIComponent(kata.bunny_video_id)}`,
          { headers: { AccessKey: bunny.apiKey, Accept: "application/json" } },
        );

        let estado: Estado;
        let progreso: number | null = null;
        if (res.status === 404) {
          estado = "error";
        } else if (res.ok) {
          const video = await res.json();
          estado = estadoDesdeBunny(Number(video?.status));
          progreso = typeof video?.encodeProgress === "number" ? video.encodeProgress : null;
        } else {
          // Fallo temporal de Bunny: no tocamos nada, se vuelve a comprobar luego.
          return { id: kata.id, estado: "procesando" as Estado, progreso };
        }

        if (estado !== "procesando") {
          await supabase.from("katas").update({ estado }).eq("id", kata.id);
        }
        return { id: kata.id, estado, progreso };
      } catch {
        return { id: kata.id, estado: "procesando" as Estado, progreso: null };
      }
    }),
  );

  return json({ revisados: resultados.length, resultados });
});
