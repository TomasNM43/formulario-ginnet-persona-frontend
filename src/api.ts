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

export async function getConfig(): Promise<AppConfig> {
  const res = await fetch(`${BASE}/config`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function getEnvio(id: number): Promise<Envio> {
  const res = await fetch(`${BASE}/envios/${id}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

// XMLHttpRequest porque fetch no expone el progreso de subida.
export function crearEnvio(
  form: { nombres: string; apellidos: string; referencia: File; prueba: File },
  onProgress: (pct: number) => void,
): Promise<EnvioCreado> {
  return new Promise((resolve, reject) => {
    const data = new FormData();
    data.append("nombres", form.nombres);
    data.append("apellidos", form.apellidos);
    data.append("referencia", form.referencia);
    data.append("prueba", form.prueba);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/envios`);
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
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as EnvioCreado);
      if (xhr.status === 413) return reject(new Error("Los archivos exceden el tamaño máximo permitido"));
      reject(new Error(typeof body.detail === "string" ? body.detail : `Error del servidor (${xhr.status})`));
    };
    xhr.send(data);
  });
}
