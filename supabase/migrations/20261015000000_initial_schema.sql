-- =====================================================================
-- Shurite-LK · App de katas · Migración inicial
-- Tablas, trigger de perfil y políticas RLS.
-- Es idempotente: se puede volver a aplicar sin romper nada.
-- Se aplica con `supabase db push` (a mano o desde GitHub Actions).
-- =====================================================================

-- ---------- Tablas ----------------------------------------------------

-- Un perfil por alumno. El id es el mismo que el del usuario de Auth.
-- nivel: 1 blanco, 2 amarillo, 3 naranja, 4 verde, 5 azul, 6 marrón, 7 negro
create table if not exists public.perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text,
  email      text,
  nivel      int  not null default 1 check (nivel between 1 and 10),
  es_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Cada kata guarda el nivel mínimo para verlo y el id del vídeo en Bunny.
create table if not exists public.katas (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  descripcion    text,
  nivel_minimo   int  not null default 1 check (nivel_minimo between 1 and 10),
  bunny_video_id text not null,
  orden          int  not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists katas_nivel_orden_idx on public.katas (nivel_minimo, orden);

-- Si ya habías ejecutado una versión anterior de este archivo, esto añade la columna
-- email y la rellena con el correo de los usuarios que ya existen.
alter table public.perfiles add column if not exists email text;
update public.perfiles p set email = u.email
  from auth.users u where u.id = p.id and p.email is null;

-- ---------- Funciones auxiliares --------------------------------------
-- security definer evita que las políticas se llamen a sí mismas en bucle.

create or replace function public.mi_nivel()
returns int
language sql stable security definer
set search_path = public
as $$
  select nivel from public.perfiles where id = auth.uid()
$$;

create or replace function public.soy_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select es_admin from public.perfiles where id = auth.uid()), false)
$$;

revoke all on function public.mi_nivel()  from public, anon;
revoke all on function public.soy_admin() from public, anon;
grant execute on function public.mi_nivel()  to authenticated;
grant execute on function public.soy_admin() to authenticated;

-- ---------- Perfil automático al crear un usuario ----------------------

create or replace function public.crear_perfil()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- ---------- Seguridad por filas (RLS) ----------------------------------
-- Sin RLS cualquiera con la clave pública podría leerlo todo.

alter table public.perfiles enable row level security;
alter table public.katas    enable row level security;

-- Perfiles: cada alumno solo lee el suyo. NO hay política de update para
-- alumnos, así que nadie puede cambiarse el cinturón ni hacerse admin.
drop policy if exists perfiles_leer_propio  on public.perfiles;
drop policy if exists perfiles_admin_todo   on public.perfiles;

create policy perfiles_leer_propio on public.perfiles
  for select to authenticated
  using (id = auth.uid());

create policy perfiles_admin_todo on public.perfiles
  for all to authenticated
  using (public.soy_admin())
  with check (public.soy_admin());

-- Katas: cada alumno ve los de su nivel y los inferiores.
drop policy if exists katas_leer_por_nivel on public.katas;
drop policy if exists katas_admin_todo     on public.katas;

create policy katas_leer_por_nivel on public.katas
  for select to authenticated
  using (nivel_minimo <= public.mi_nivel() or public.soy_admin());

create policy katas_admin_todo on public.katas
  for all to authenticated
  using (public.soy_admin())
  with check (public.soy_admin());

-- ---------- Permisos de las tablas para la API -------------------------
-- Los proyectos nuevos de Supabase pueden crear las tablas SIN darles acceso
-- automático desde la API. Se dan aquí de forma explícita y mínima; la
-- seguridad por filas (RLS) de arriba sigue decidiendo QUÉ filas ve cada uno.
-- A anon (visitantes sin sesión) no se le da nada.

grant usage on schema public to authenticated;

grant select, update                 on public.perfiles to authenticated;
grant select, insert, update, delete on public.katas    to authenticated;

-- Las Edge Functions del servidor (create-student) usan service_role.
grant select, insert, update, delete on public.perfiles to service_role;
grant select, insert, update, delete on public.katas    to service_role;
