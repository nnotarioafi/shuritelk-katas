// Edge Function: devuelve una URL del reproductor de Bunny firmada y con caducidad.
// Solo responde si el alumno (por su JWT) puede ver ese kata según las políticas RLS.
//
// Secretos necesarios (supabase secrets set ...):
//   BUNNY_LIBRARY_ID   id numérico de la Video Library
//   BUNNY_TOKEN_KEY    clave de "Embed view token authentication" de la library
// SUPABASE_URL y las claves públicas las inyecta Supabase automáticamente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { publicKey } from "../_shared/admin.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VIDEO_TTL_SECONDS = 2 * 60 * 60; // la URL caduca a las 2 horas

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function sha256Hex(text: string) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sin sesión" }, 401);

  let kataId: string | undefined;
  try {
    ({ kata_id: kataId } = await req.json());
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }
  if (!kataId) return json({ error: "Falta kata_id" }, 400);

  // Cliente que actúa COMO el alumno: RLS decide si puede ver el kata.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    publicKey()!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: kata, error } = await supabase
    .from("katas")
    .select("bunny_video_id")
    .eq("id", kataId)
    .maybeSingle();

  if (error) return json({ error: "No se pudo comprobar el acceso" }, 500);
  if (!kata) return json({ error: "Kata no disponible para tu cinturón" }, 403);

  const libraryId = Deno.env.get("BUNNY_LIBRARY_ID");
  const tokenKey = Deno.env.get("BUNNY_TOKEN_KEY");
  if (!libraryId || !tokenKey) return json({ error: "Falta configuración de Bunny" }, 500);

  // Bunny: token = SHA256_HEX(clave + videoId + expiración en segundos Unix)
  const expires = Math.floor(Date.now() / 1000) + VIDEO_TTL_SECONDS;
  const token = await sha256Hex(`${tokenKey}${kata.bunny_video_id}${expires}`);

  const url =
    `https://iframe.mediadelivery.net/embed/${libraryId}/${kata.bunny_video_id}` +
    `?token=${token}&expires=${expires}&autoplay=false&preload=true`;

  return json({ url, expires });
});
