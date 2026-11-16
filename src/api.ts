export type Estado = "pendiente" | "procesando" | "listo" | "error";

export interface AppConfig {
  allowed_extensions: string[];
  max_upload_mb: number;
}

export interface EnvioCreado {
  id: number;
  tag: string;
  estado: Estado;
}

export interface Envio extends EnvioCreado {
  nombres: string | null;
  apellidos: string | null;
  fecha_creacion: string | null;
  error: string | null;
}

const BASE = import.meta.env.VITE_API_BASE ?? "/api";
const TOKEN_KEY = "ginnet_token";

export interface User {
  nombres: string;
  apellidos: string;
  correo: string;
}

export const getToken = () => sessionStorage.getItem(TOKEN_KEY);
export const clearSession = () => sessionStorage.removeItem(TOKEN_KEY);

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Una respuesta 401 en una llamada autenticada cierra la sesión (token vencido o inválido).
function expireSession(): void {
  clearSession();
  window.dispatchEvent(new Event("auth-expired"));
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return "Datos del formulario inválidos";
  } catch {
    /* sin cuerpo JSON */
  }
  return `Error del servidor (${res.status})`;
}

async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...init.headers, ...authHeaders() } });
  if (res.status === 401) expireSession();
  return res;
}

export async function login(correo: string, clave: string): Promise<User> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo, clave }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const body = await res.json();
  sessionStorage.setItem(TOKEN_KEY, body.access_token);
  return body.user;
}

export async function getMe(): Promise<User> {
  const res = await authedFetch(`${BASE}/auth/me`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function getConfig(): Promise<AppConfig> {
  const res = await fetch(`${BASE}/config`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export interface Frase {
  id: string;
  frase: string;
  orden: number;
}

export interface VerifyResult {
  match: boolean;
  similarity: number;
  transcription: string;
  missing_words: string[];
}

export async function getFrases(): Promise<Frase[]> {
  const res = await authedFetch(`${BASE}/voice/phrases`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function verifyPhrase(phraseId: string, file: File, threshold?: number): Promise<VerifyResult> {
  const data = new FormData();
  data.append("file", file);
  data.append("phrase_id", phraseId);
  if (threshold !== undefined) data.append("threshold", String(threshold));
  const res = await authedFetch(`${BASE}/voice/verify-phrase`, { method: "POST", body: data });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function getEnvio(id: number): Promise<Envio> {
  const res = await authedFetch(`${BASE}/envios/${id}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

// XMLHttpRequest porque fetch no expone el progreso de subida.
export function crearEnvio(
  form: { audios: { fraseId: string; file: File }[] },
  onProgress: (pct: number) => void,
): Promise<EnvioCreado> {
  return new Promise((resolve, reject) => {
    const data = new FormData();
    form.audios.forEach((a) => {
      data.append("frase_ids", a.fraseId);
      data.append("audios", a.file);
    });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/envios`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("No se pudo conectar con el servidor"));
    xhr.ontimeout = () => reject(new Error("La subida tardó demasiado"));
    xhr.onload = () => {
      let body: { detail?: unknown } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* respuesta no JSON (p. ej. 413 de IIS) */
      }
      if (xhr.status === 401) {
        expireSession();
        return reject(new Error("Tu sesión expiró. Inicia sesión de nuevo."));
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as EnvioCreado);
      if (xhr.status === 413) return reject(new Error("Los archivos exceden el tamaño máximo permitido"));
      reject(new Error(typeof body.detail === "string" ? body.detail : `Error del servidor (${xhr.status})`));
    };
    xhr.send(data);
  });
}
