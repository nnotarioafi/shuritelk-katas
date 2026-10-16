-- =====================================================================
-- Estado del vídeo de cada kata: 'procesando' | 'listo' | 'error'
-- Un kata nuevo nace 'procesando' y los alumnos NO lo ven hasta que Bunny
-- termina de convertir el vídeo (la función video-status lo marca 'listo').
-- Los katas que ya existían antes de esta migración quedan como 'listo'.
-- =====================================================================

-- Las filas existentes se quedan en 'listo'...
alter table public.katas add column if not exists estado text not null default 'listo';
-- ...y los katas nuevos empiezan en 'procesando'.
alter table public.katas alter column estado set default 'procesando';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'katas_estado_check') then
    alter table public.katas
      add constraint katas_estado_check check (estado in ('procesando', 'listo', 'error'));
  end if;
end $$;

-- Los alumnos solo ven katas 'listo' de su cinturón o inferior. El admin lo ve todo.
drop policy if exists katas_leer_por_nivel on public.katas;

create policy katas_leer_por_nivel on public.katas
  for select to authenticated
  using (
    (estado = 'listo' and nivel_minimo <= public.mi_nivel())
    or public.soy_admin()
  );
