# Shurite-LK · App de katas

PWA para que cada alumno vea los katas de su cinturón y los inferiores.
Stack: Vite + React · Supabase (login, base de datos, seguridad) · Bunny Stream (vídeos).

```
supabase/migrations/                   esquema de la base de datos (tablas, trigger de perfil, RLS)
supabase/useful-queries.sql            consultas de administración para copiar y pegar
.github/workflows/supabase-deploy.yml  despliegue automático de migraciones y funciones (opcional)
supabase/functions/video-url/          firma las URLs de vídeo para los alumnos
supabase/functions/upload-credentials/ prepara la subida directa de un vídeo a Bunny (solo admin)
supabase/functions/delete-kata/        borra un kata y su vídeo en Bunny (solo admin)
supabase/functions/create-student/     da de alta a un alumno (solo admin)
supabase/functions/_shared/admin.ts    comprobación de admin y utilidades comunes
src/                                   la PWA (login, katas, reproductor y administración)
```

## 1. Supabase

1. Crea el proyecto en supabase.com con estos ajustes:
   - **Region:** una europea (por ejemplo Frankfurt), para que sea rápido desde España.
   - **Database password:** larga y única. Guárdala: la pide el despliegue automático (`SUPABASE_DB_PASSWORD`).
   - **Data API:** déjala **activada**. La app habla con la base de datos a través de ella.
   - **Automatically expose new tables:** da igual si está activada o no: la migración concede los permisos
     que hacen falta de forma explícita.
   - **Automatic RLS** (si aparece): puedes activarla; la migración ya activa RLS en sus tablas.
2. Crea las tablas y las políticas. Dos formas, elige una:
   - **A mano:** **SQL Editor** → pega el contenido de `supabase/migrations/20261015000000_initial_schema.sql` → Run.
   - **Con la CLI** (la que usa también el despliegue automático): `npx supabase@latest link --project-ref TU-REF`
     y después `npx supabase@latest db push`.
   El archivo se puede aplicar más de una vez sin romper nada.
3. **Authentication → Sign In / Providers → Email**: desactiva **Allow new users to sign up**
   (así solo entran los alumnos que tú des de alta).
4. **Authentication → Emails → Templates**: en las plantillas **Magic link** y **Confirm signup**
   incluye `{{ .Token }}` para que el correo muestre el código de 6 dígitos, por ejemplo:

   ```html
   <h2>Tu código para entrar</h2>
   <p>Introduce este código en la app de Shurite-LK:</p>
   <p style="font-size:32px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   ```
5. **Authentication → Emails → SMTP Settings**: configura tu SMTP (Resend, Brevo…).
   El SMTP por defecto de Supabase solo permite un par de correos por hora.
   Después sube el límite en **Authentication → Rate Limits** si vas a dar de alta a muchos alumnos.
6. **Tu usuario admin**: Authentication → Users → **Add user → Create new user** (marca *Auto Confirm User*),
   y ejecuta en el SQL Editor la consulta 1 de `supabase/useful-queries.sql` (te hace admin).

### Dar de alta alumnos y cambiar cinturón
Lo normal es hacerlo desde la pantalla **Administración** de la propia app (ver más abajo).
Si prefieres el panel de Supabase:
- Alta: **Authentication → Users → Add user → Create new user** con su correo y *Auto Confirm User* marcado.
  Se crea su perfil automáticamente con cinturón blanco.
- Cinturón: **Table Editor → perfiles** y edita `nivel` (1 blanco, 2 amarillo, 3 naranja, 4 verde,
  5 azul, 6 marrón, 7 negro), o con SQL para varios a la vez.

## 2. Bunny Stream

1. Crea una **Video Library** y sube los vídeos. Copia el **GUID** de cada vídeo.
2. En la library → **Security**: activa **Embed view token authentication** y copia la clave.
   Añade tu dominio en **Allowed domains** (y `localhost` si pruebas en local).
3. Anota el **Library ID** (número) y, en la página **API** de la library, la **API key**
   (sirve para subir y borrar vídeos; no la confundas con la clave de *Embed view token*).
4. Los katas se crean desde la pantalla de Administración de la app. Si prefieres hacerlo a mano:
   **Table Editor → katas** con título, descripción, `nivel_minimo`, `bunny_video_id` (el GUID) y `orden`.

## 3. Edge Functions

Requiere la [CLI de Supabase](https://supabase.com/docs/guides/cli).

```bash
supabase login
supabase link --project-ref TU-REF

supabase secrets set \
  BUNNY_LIBRARY_ID=123456 \
  BUNNY_TOKEN_KEY=clave-de-embed-view-token \
  BUNNY_API_KEY=api-key-de-la-library

supabase functions deploy video-url
supabase functions deploy upload-credentials
supabase functions deploy delete-kata
supabase functions deploy create-student
```

- `video-url`: comprueba con el JWT del alumno que puede ver ese kata (mismas políticas RLS)
  y devuelve la URL del reproductor firmada, que caduca a las 2 horas.
- `upload-credentials`, `delete-kata` y `create-student`: solo responden a administradores
  (`es_admin = true`). Las claves de Bunny y la `service_role` viven únicamente en el servidor.
- Los secretos de Bunny solo existen en Supabase; nunca van en el `.env` de la app.

## 4. Despliegue automático con GitHub (opcional)

El archivo `.github/workflows/supabase-deploy.yml` hace dos cosas, solo cuando cambia algo dentro de `supabase/`:
- **En un pull request:** muestra qué migraciones se aplicarían, sin aplicarlas (`db push --dry-run`).
- **Al hacer merge o push a `main`:** aplica las migraciones nuevas y despliega todas las Edge Functions.

Configuración, una sola vez, en GitHub → *Settings → Secrets and variables → Actions → New repository secret*:

| Secreto | Dónde se obtiene |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens → Generate new token |
| `SUPABASE_PROJECT_REF` | El ID corto de la URL de tu proyecto (también en Project Settings → General) |
| `SUPABASE_DB_PASSWORD` | La contraseña de la base de datos (Project Settings → Database; ahí puedes restablecerla) |

Los secretos de Bunny (`BUNNY_*`) **no** van a GitHub: se fijan una vez con `supabase secrets set` (ver apartado 3)
y se quedan en Supabase.

### Cómo cambiar la base de datos a partir de ahora
Ya no se edita un script. Cada cambio es un archivo nuevo:

```bash
npx supabase@latest migration new anadir_campo_x
# edita el archivo creado en supabase/migrations/ y escribe el SQL
git add . && git commit -m "Añadir campo x" && git push
```

El historial queda en Git y cada migración se aplica una sola vez. Si algo sale mal, se corrige con una migración nueva.

**Si ya habías ejecutado el esquema a mano** en el SQL Editor, el primer `db push` volverá a aplicar la migración
inicial. No pasa nada porque está escrita para poder repetirse.

## 5. La PWA

```bash
cp .env.example .env     # rellena URL y clave pública (anon / publishable) de Supabase
npm install
npm run dev              # desarrollo en http://localhost:5173
npm run build            # genera la carpeta dist/
```

⚠️ En `.env` solo van la URL y la clave **pública**. Nunca la `service_role`.

### Pantalla de Administración
Si tu perfil tiene `es_admin = true`, en la lista de katas aparece **Administrar alumnos y katas**.
- **Alumnos:** buscar, cambiar el cinturón (se guarda al momento) y **+ Alta** para crear un alumno nuevo.
- **Katas:** **+ Nuevo kata** (título, descripción, cinturón mínimo, orden y vídeo). El vídeo se sube
  directamente a Bunny con barra de progreso; la pantalla debe seguir encendida hasta que termine.
  Después Bunny tarda unos minutos en procesarlo. También puedes editar y borrar katas
  (al borrar se elimina el vídeo en Bunny para no pagar almacenamiento de vídeos huérfanos).
- Para cambiar el vídeo de un kata: bórralo y créalo de nuevo.

### Despliegue (Cloudflare Pages, Netlify o Vercel)
Cada `git push` a `main` actualiza la app (Cloudflare) y, si tocaste `supabase/`, también la base de datos y las funciones.

- Build command: `npm run build` · Output directory: `dist`
- Variables de entorno: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
- Usa HTTPS (lo dan por defecto) o la PWA no se podrá instalar.

### Instalar en el móvil
- **Android (Chrome):** menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari):** Compartir → *Añadir a pantalla de inicio*.

## Checklist antes de invitar a los alumnos
- [ ] Registro libre desactivado.
- [ ] SMTP propio configurado y probado con Gmail, Outlook e iCloud (revisa spam).
- [ ] Plantilla de correo con `{{ .Token }}`.
- [ ] Alumno de prueba con cinturón bajo: comprueba que NO ve katas de cinturones superiores.
- [ ] Pantalla completa del vídeo probada en iPhone y Android con la PWA instalada.
- [ ] Subida de un vídeo de prueba desde el móvil (y comprobar que se reproduce tras procesarse).
- [ ] Un alumno normal NO ve el botón de Administración y, si prueba a abrir `/#/admin`, vuelve a la lista.
- [ ] Plan Pro de Supabase si lo van a usar alumnos reales (el gratuito se pausa tras 7 días sin actividad).

## Pendiente para más adelante
- Aviso de "procesando" mientras Bunny termina de convertir el vídeo.
- Sustituir el vídeo de un kata sin borrarlo.
- Acceso por WhatsApp en lugar de correo (Twilio).
