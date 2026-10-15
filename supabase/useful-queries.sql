-- =====================================================================
-- Consultas útiles de administración.
-- NO es una migración: copia la que necesites en Supabase > SQL Editor.
-- =====================================================================

-- 1) Hacerte admin con el nivel más alto (una sola vez, después de crear tu usuario
--    en Authentication > Users > Add user):
update public.perfiles
   set es_admin = true, nivel = 7, nombre = 'Tu nombre'
 where id = (select id from auth.users where email = 'tu@correo.com');

-- 2) Subir de cinturón a un alumno:
update public.perfiles set nivel = 3
 where id = (select id from auth.users where email = 'alumno@correo.com');

-- 3) Subir de cinturón a varios a la vez:
update public.perfiles set nivel = 3
 where email in ('alumno1@correo.com', 'alumno2@correo.com');

-- 4) Añadir un kata a mano (el id es el GUID del vídeo en Bunny):
insert into public.katas (titulo, descripcion, nivel_minimo, bunny_video_id, orden)
values ('Heian Shodan', 'Descripción del kata', 2, 'GUID-DEL-VIDEO', 1);
