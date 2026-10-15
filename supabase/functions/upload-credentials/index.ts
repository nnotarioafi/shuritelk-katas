// Edge Function: prepara una subida de vídeo directa a Bunny (protocolo TUS).
//  1) comprueba que quien llama es admin
//  2) crea el vídeo vacío en Bunny y obtiene su GUID
//  3) firma la subida: SHA256(libraryId + apiKey + expiración + videoId)
// La clave de API de Bunny NUNCA sale de aquí.
//
// Secretos: BUNNY_LIBRARY_ID, BUNNY_API_KEY

import { bunnyConfig, CORS, json, requireAdmin, sha256Hex } from "../_shared/admin.ts";

const UPLOAD_TTL_SECONDS = 3 * 60 * 60; // margen para vídeos grandes con mala conexión

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;

  let title = "";
  try {
    ({ title } = await req.json());
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }
  title = String(title ?? "").trim().slice(0, 200);
  if (!title) return json({ error: "Falta el título" }, 400);

  const bunny = bunnyConfig();
  if (!bunny) return json({ error: "Falta configuración de Bunny en el servidor" }, 500);

  // 1) Crear el vídeo vacío
  const res = await fetch(`https://video.bunnycdn.com/library/${bunny.libraryId}/videos`, {
    method: "POST",
    headers: { AccessKey: bunny.apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) return json({ error: "Bunny no pudo crear el vídeo" }, 502);
  const video = await res.json();
  const videoId: string | undefined = video?.guid;
  if (!videoId) return json({ error: "Bunny no devolvió el id del vídeo" }, 502);

  // 2) Firmar la subida
  const expirationTime = Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECONDS;
  const signature = await sha256Hex(`${bunny.libraryId}${bunny.apiKey}${expirationTime}${videoId}`);

  return json({ videoId, libraryId: bunny.libraryId, expirationTime, signature });
});
