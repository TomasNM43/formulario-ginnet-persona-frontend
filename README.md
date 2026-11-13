# Formulario Ginnet – Audio Persona

Formulario web (React + Vite + TypeScript) y API (FastAPI) para enviar nombres, apellidos y dos audios (referencia y prueba).
Los audios se guardan en disco; los datos en `GINNET_AUDIO.PERSONA_AUDIO` (Oracle, tabla ya existente). Un worker (`worker.py`) procesa los envíos.

```
backend/   FastAPI + worker + tests        frontend/  React/Vite (se compila a estáticos)
```

## Desarrollo local

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements-dev.txt
copy .env.example .env          # completar DB_USER, DB_PASSWORD, DB_DSN, AUDIO_ROOT, LOG_DIR
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000
.\.venv\Scripts\python worker.py          # en otra terminal

cd ..\frontend
npm install
npm run dev                      # http://localhost:5173 (proxy /api -> :8000)
```

La configuración se lee de `ENV_FILE` (variable de entorno) o, si no existe, de `backend\.env`. Si falta una variable obligatoria
(`DB_USER`, `DB_PASSWORD`, `DB_DSN`, `AUDIO_ROOT`, `LOG_DIR`) la app termina al arrancar listando los nombres faltantes (nunca valores).

## API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/envios` | multipart: `nombres`, `apellidos`, `referencia`, `prueba` → `201 {id, tag, estado}` |
| GET | `/api/envios/{id}` | datos y estado (mensaje genérico si `error`) |
| GET | `/api/health` | API + `SELECT 1 FROM DUAL` |
| GET | `/api/config` | extensiones permitidas y tamaño máximo (para validar en el cliente) |

## Despliegue en Windows Server + IIS

Estructura sugerida: `C:\apps\audios\{backend, config\.env, logs}` y `C:\inetpub\audios-web` (frontend compilado).

1. **Requisitos de IIS**: instalar *HttpPlatformHandler v1.2* (Web Platform Installer / MSI de Microsoft) y el módulo *URL Rewrite*. Python 3.11+ instalado para todos los usuarios.
2. **Backend**:
   ```powershell
   cd C:\apps\audios\backend
   python -m venv .venv
   .\.venv\Scripts\pip install -r requirements.txt
   ```
3. **`.env` fuera del sitio**: copiar `.env.example` a `C:\apps\audios\config\.env`, completarlo, y restringir permisos:
   ```powershell
   icacls C:\apps\audios\config /inheritance:r /grant "Administrators:(OI)(CI)F" "IIS AppPool\AudiosApi:(OI)(CI)R" "NT SERVICE\AudiosWorker:(OI)(CI)R"
   ```
   (si el worker corre con otra cuenta, otorgarle lectura a esa). `backend\web.config` apunta a él con `ENV_FILE`.
4. **App Pool** `AudiosApi`: *Sin código administrado*, Identidad `ApplicationPoolIdentity` (o cuenta de servicio), *Start Mode = AlwaysRunning*, *Idle Time-out = 0*.
5. **Sitios**:
   - Sitio `audios-web` → carpeta con el contenido de `frontend\dist` (incluye su `web.config` con el fallback SPA que excluye `/api`).
   - Aplicación `/api` bajo ese sitio → carpeta física `C:\apps\audios\backend`, usando el App Pool `AudiosApi`. HttpPlatformHandler reenvía la ruta completa, por eso las rutas de FastAPI ya incluyen `/api`.
   - Editar en `backend\web.config`: `processPath` (ruta del `python.exe` del venv) y `ENV_FILE`. `maxAllowedContentLength` está calculado para 200 MB × 2 archivos + 1 MB; recalcular (`2*MAX_UPLOAD_MB*1048576 + 1048576`) si cambia `MAX_UPLOAD_MB`.
6. **Frontend**: `cd frontend; npm install; npm run build` (Node solo para compilar) y copiar `dist\*` al sitio. Si frontend y API estuvieran en orígenes distintos, definir `CORS_ORIGINS` y `VITE_API_BASE`.
7. **Audios**: dar *Modificar* al App Pool sobre `AUDIO_ROOT`:
   ```powershell
   icacls D:\audios /grant "IIS AppPool\AudiosApi:(OI)(CI)M" "NT SERVICE\AudiosWorker:(OI)(CI)M"
   ```
   Para UNC, la identidad debe ser una cuenta de dominio con acceso al recurso compartido y NTFS.
8. **Logs**: dar *Modificar* sobre `LOG_DIR` y la carpeta de `stdoutLogFile`. Cada proceso escribe su propio archivo rotativo (`api-<pid>.log`, `worker-<pid>.log`), en JSON.
9. **Worker con NSSM**:
   ```powershell
   nssm install AudiosWorker C:\apps\audios\backend\.venv\Scripts\python.exe worker.py
   nssm set AudiosWorker AppDirectory C:\apps\audios\backend
   nssm set AudiosWorker AppEnvironmentExtra ENV_FILE=C:\apps\audios\config\.env
   nssm set AudiosWorker AppStopMethodConsole 15000
   nssm set AudiosWorker Start SERVICE_AUTO_START
   nssm start AudiosWorker
   ```
   Se puede ejecutar más de una instancia: el reclamo es atómico.

### Dimensionamiento del pool
Cada proceso tiene su propio pool. Con `--workers 4` y `DB_POOL_MAX=10` la API puede abrir hasta **40 sesiones**, más el pool de cada worker. Verifique con el DBA que `SESSIONS`/`PROCESSES` lo permitan o reduzca `DB_POOL_MAX`.

### Permisos Oracle para `DB_USER`
Sobre `GINNET_AUDIO.PERSONA_AUDIO`: `SELECT`, `INSERT`, `UPDATE`. El `INSERT` dispara `PERSONA_AUDIO_TRG` (que usa `PERSONA_AUDIO_SEQ` con los privilegios del dueño del trigger), por lo que no se requiere permiso sobre la secuencia salvo que el trigger se haya definido con `AUTHID CURRENT_USER`. No se necesita `DELETE` ni DDL.

## Notas y decisiones
- **Grabación en el formulario**: cada audio se puede subir como archivo o grabar con el micrófono (`MediaRecorder`), con escucha previa y opción de regrabar. La grabación se convierte en el navegador a WAV mono 16-bit (≈5 MB/min a 44,1 kHz), así que el backend no cambia. Se ofrece solo si `wav` está en `ALLOWED_EXTENSIONS`. **El navegador solo permite el micrófono en HTTPS** (o `localhost`): el sitio de IIS necesita un certificado y un binding https.
- **Thin mode**: no se llama a `init_oracle_client()`. Todo lo usado (pool, bind variables, `RETURNING ... INTO`, `FETCH FIRST`) funciona en thin. Si algo falla, se avisará antes de pasar a thick.
- **Validación de audio**: por cabecera (wav/RIFF-WAVE, mp3/ID3 o sync, flac, ogg) y debe coincidir con la extensión; no valida que el audio esté íntegro. Solo se aceptan estas extensiones en `ALLOWED_EXTENSIONS`.
- **Tamaño**: `MAX_UPLOAD_MB` es por archivo. Starlette vuelca las partes grandes a archivos temporales (no a RAM) y se copian por bloques con `shutil.copyfileobj`.
- **Bytes**: las longitudes (100/500/200/1000) se calculan en UTF-8, asumiendo base de datos AL32UTF8.
- **Tag duplicado**: se detecta `ORA-00001` sobre `PERSONA_AUDIO_TAG_UK`; hasta 5 intentos borrando antes los archivos del intento fallido.
- **Worker**: `procesar()` en `backend/worker.py` es el punto de extensión. Los trabajos `procesando` con más de `STUCK_JOB_MINUTES` vuelven a `pendiente` (si `procesar` tarda más que eso, súbalo para evitar doble procesamiento).
- **Tests**: la BD simulada es SQLite (esquema `main`); la forma del SQL para Oracle se verifica compilando con el dialecto Oracle. No sustituye una prueba de integración contra Oracle real.
