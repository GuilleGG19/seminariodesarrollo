# Despliegue del SCCVI

| Pieza | Servicio | Carpeta del repositorio |
|---|---|---|
| Base de datos PostgreSQL | Supabase (plan Free) | `db/init` (migraciones) |
| Backend (API, alertas, bot de Telegram) | Railway | `backend` |
| Frontend (React) | Vercel (plan Hobby) | `frontend` |

```
Navegador ──> Vercel (frontend + reenvío de /api) ──> Railway (backend) ──> Supabase (PostgreSQL)
```

El navegador solo habla con Vercel: Vercel reenvía `/api/*` al backend. Así la cookie de sesión
es del mismo sitio y no hace falta configurar CORS.

> **Orden:** Supabase → migraciones → Railway → Vercel → ajustes finales.
> Usa la **misma región** en Supabase y Railway (por ejemplo, costa este de EE. UU.):
> cada pantalla hace varias consultas y la distancia entre ambos se nota.

---

## 0. Antes de empezar

1. Sube a GitHub la última versión del código (`git push`).
2. Genera **secretos nuevos para producción** (no reutilices los de tu computadora):
   ```
   cd backend
   npm run secretos
   ```
   Guarda `JWT_SECRET`, `DATA_ENCRYPTION_KEY` y `DATA_HASH_KEY` en un lugar seguro.
   **Si pierdes las dos claves `DATA_*`, los DPI, teléfonos y correos cifrados no se pueden recuperar.**
3. Crea un **segundo bot de Telegram** para producción con @BotFather (`/newbot`).
   Un bot solo puede estar conectado a un backend a la vez; el de tu computadora sigue siendo el de pruebas.

---

## 1. Supabase (base de datos)

1. En [supabase.com](https://supabase.com) → **New project**.
   - **Database password:** una contraseña larga (usa el generador). Guárdala.
   - **Region:** East US (o la misma que usarás en Railway).
2. Cuando termine de crearse, botón **Connect** (arriba) → pestaña **Connection string** →
   **Session pooler** → copia la URI. Se ve así:
   ```
   postgresql://postgres.abcdefghij:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```
   Reemplaza `[YOUR-PASSWORD]` por tu contraseña. Esa es tu **`DATABASE_URL`**.
   (Usa el *Session pooler*: la conexión directa solo funciona por IPv6.)
3. **Project Settings → Database → SSL Configuration → Download certificate**.
   Guarda el archivo (por ejemplo `supabase-ca.crt`). Es tu **`DB_SSL_CA`**.
4. Recomendado: **Project Settings → Data API** → desactiva la API de datos.
   El SCCVI no la usa (de todos modos la migración 12 bloquea el acceso a las tablas por esa vía).

## 2. Migraciones y primer administrador

Desde tu computadora, en PowerShell, dentro de `backend`:

```powershell
$env:DATABASE_URL = "postgresql://postgres.abcdefghij:TU_CLAVE@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
$env:DB_SSL = "verify"
$env:DB_SSL_CA = Get-Content "C:\ruta\supabase-ca.crt" -Raw
# Las claves de PRODUCCION (las del paso 0), no las de tu .env:
$env:DATA_ENCRYPTION_KEY = "..."
$env:DATA_HASH_KEY = "..."

npm run migrar
npm run crear-admin -- "Tu Nombre" tu-correo@dominio.com "UnaContraseña2026"
```

`npm run migrar` debe terminar con *Migraciones aplicadas correctamente* (12 archivos).
Al terminar, **cierra esa ventana de PowerShell** para no dejar la conexión de producción
en variables de entorno.

## 3. Railway (backend)

1. En [railway.com](https://railway.com) → **New Project → Deploy from GitHub repo** → elige el repositorio.
2. En el servicio creado → **Settings**:
   - **Source → Root Directory:** `backend`
   - **Source → Branch:** la rama que vas a presentar (`dev` o `main`).
   - **Networking → Generate Domain** → anota la URL (por ejemplo `https://sccvi-api-production.up.railway.app`).
   - **Deploy → Region:** la misma región que Supabase.
3. **Variables** (pestaña *Variables* → *Raw Editor*):
   ```
   NODE_ENV=production
   DATABASE_URL=postgresql://postgres.abcdefghij:TU_CLAVE@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   DB_SSL=verify
   DB_SSL_CA=<el certificado EN UNA SOLA LÍNEA, ver abajo>
   JWT_SECRET=<del paso 0>
   DATA_ENCRYPTION_KEY=<del paso 0>
   DATA_HASH_KEY=<del paso 0>

   FRONTEND_URL=https://TU-PROYECTO.vercel.app
   TRUST_PROXY=2
   RESEND_API_KEY=re_...
   EMAIL_FROM=SCCVI <onboarding@resend.dev>
   TELEGRAM_BOT_TOKEN=<token del bot de PRODUCCIÓN>
   DOCS_ENABLED=true
   ```
   - `DB_SSL_CA`: **no pegues el certificado con saltos de línea** en el Raw Editor: cada línea del
     certificado se convierte en una variable basura y el build falla con
     `secret ID missing for "" environment variable`. Cópialo ya en una sola línea con PowerShell:
     ```powershell
     (Get-Content "C:\ruta\supabase-ca.crt" -Raw).Trim() -replace "`r?`n", '\n' | Set-Clipboard
     ```
     y pégalo como valor de `DB_SSL_CA` (queda `-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----`).
   - `FRONTEND_URL`: si aún no sabes la URL de Vercel, pon una provisional y corrígela en el paso 5
     (se usa en el enlace del QR del carnet).
   - `DOCS_ENABLED=true` publica la documentación Swagger en `/api/docs` (útil para la presentación).
4. Railway despliega solo. En **Deployments → View logs** debes ver:
   ```
   Base de datos conectada: postgres (...)
   Servidor SCCVI corriendo en ...
   Bot de Telegram activo: @tu_bot_de_produccion
   ```
   Si algo falta, el log dice exactamente qué variable revisar.
5. Prueba: abre `https://TU-BACKEND.up.railway.app/health/db` → debe responder `"status":"ok"`.

## 4. Vercel (frontend)

1. En el repositorio, edita `frontend/vercel.json` y cambia
   `https://URL-DEL-BACKEND.up.railway.app` por la URL de Railway del paso 3. Haz commit y push.
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repositorio.
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (lo detecta solo). No hace falta ninguna variable de entorno.
3. **Deploy**. Anota la URL (por ejemplo `https://sccvi.vercel.app`).

## 5. Ajustes finales

1. En Railway, actualiza `FRONTEND_URL` con la URL real de Vercel (se redepliega solo).
2. Revisa que todo funcione **desde la URL de Vercel**:
   - [ ] Iniciar sesión con el administrador del paso 2.
   - [ ] Crear comunidad, padre (con tu correo de Resend) y niño.
   - [ ] Registrar una medición con peso bajo → aparece la alerta.
   - [ ] Notificaciones → *Enviar pendientes ahora* → llega el correo.
   - [ ] Vincular Telegram desde la ficha del padre → llega la alerta por Telegram.
   - [ ] Generar el carnet QR y abrirlo **desde un celular** con el PIN.
   - [ ] Reportes → descargar PDF y Excel.
3. **Auditoría** (como administrador): en la columna IP debe aparecer **tu IP pública**.
   Si aparece una IP de Railway o de Vercel, ajusta `TRUST_PROXY` (prueba `1` o `3`): esa IP se usa
   para limitar intentos de inicio de sesión.

---

## Costos y límites

- **Railway:** prueba de 30 días con USD 5 de crédito. Revisa el consumo en *Usage*. Si el crédito
  baja de USD 1 antes de la presentación, activa el plan Hobby (USD 5/mes) en el mismo proyecto:
  no cambia nada más.
- **Supabase Free:** 500 MB. Pausa el proyecto tras 7 días sin actividad; el backend lo consulta
  todos los días (revisión de alertas de las 06:00), así que no debería pausarse. Si ocurre, se
  reactiva desde el panel sin perder datos.
- **Resend con `onboarding@resend.dev`:** solo entrega al correo dueño de la cuenta de Resend.
  Para enviar a cualquier padre hay que verificar un dominio propio y cambiar `EMAIL_FROM`.

## Actualizar después

- Cambios de código: `git push` → Railway y Vercel redepliegan solos.
- Migración nueva (`db/init/13_...sql`): repite el paso 2 (solo `npm run migrar`) **antes** del push.
