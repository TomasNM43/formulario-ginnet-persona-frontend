import { useEffect, useState, type FormEvent } from "react";
import { crearEnvio, getEnvio, type AppConfig, type Envio, type EnvioCreado } from "../api";
import AudioField from "./AudioField";

const MAX_NAME_BYTES = 100;
const POLL_MS = 3000;
const byteLen = (s: string) => new TextEncoder().encode(s).length;

function validateFile(file: File | null, cfg: AppConfig): string | null {
  if (!file) return "Selecciona un archivo";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!cfg.allowed_extensions.includes(ext)) return `Formato no permitido (${cfg.allowed_extensions.join(", ")})`;
  if (file.size === 0) return "El archivo está vacío";
  if (file.size > cfg.max_upload_mb * 1024 * 1024) return `Supera el máximo de ${cfg.max_upload_mb} MB`;
  return null;
}

function validateName(value: string, label: string): string | null {
  const v = value.trim();
  if (!v) return `${label} es obligatorio`;
  if (byteLen(v) > MAX_NAME_BYTES) return `${label} es demasiado largo`;
  return null;
}

export default function FormularioEnvio({ config }: { config: AppConfig }) {
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [referencia, setReferencia] = useState<File | null>(null);
  const [prueba, setPrueba] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [progress, setProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [envio, setEnvio] = useState<EnvioCreado | null>(null);
  const [estado, setEstado] = useState<Envio | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const accept = config.allowed_extensions.map((e) => `.${e}`).join(",");
  // La grabación se exporta como WAV: solo se ofrece si el servidor lo permite.
  const canRecord = config.allowed_extensions.includes("wav");

  useEffect(() => {
    if (!envio) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const e = await getEnvio(envio.id);
        if (cancelled) return;
        setEstado(e);
        setPollError(null);
        if (e.estado === "listo" || e.estado === "error") clearInterval(timer);
      } catch (err) {
        if (!cancelled) setPollError((err as Error).message);
      }
    };
    const timer = setInterval(tick, POLL_MS);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [envio]);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const errs = {
      nombres: validateName(nombres, "Nombres"),
      apellidos: validateName(apellidos, "Apellidos"),
      referencia: validateFile(referencia, config),
      prueba: validateFile(prueba, config),
    };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;

    setSubmitError(null);
    setSending(true);
    setProgress(0);
    try {
      setEnvio(await crearEnvio({ nombres: nombres.trim(), apellidos: apellidos.trim(), referencia: referencia!, prueba: prueba! }, setProgress));
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setEnvio(null);
    setEstado(null);
    setNombres("");
    setApellidos("");
    setReferencia(null);
    setPrueba(null);
    setProgress(0);
    setErrors({});
  }

  if (envio) {
    const actual = estado?.estado ?? envio.estado;
    return (
      <section>
        <p>
          Envío registrado. Tag: <code>{envio.tag}</code>
        </p>
        <div className={`estado ${actual}`}>
          Estado: <strong>{actual}</strong>
          {actual === "error" && <p>{estado?.error ?? "El procesamiento falló."}</p>}
        </div>
        {pollError && <p className="error">No se pudo actualizar el estado: {pollError}</p>}
        {(actual === "listo" || actual === "error") && <button onClick={reset}>Nuevo envío</button>}
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <label>
        Nombres
        <input type="text" value={nombres} onChange={(e) => setNombres(e.target.value)} disabled={sending} />
        {errors.nombres && <span className="field-error">{errors.nombres}</span>}
      </label>
      <label>
        Apellidos
        <input type="text" value={apellidos} onChange={(e) => setApellidos(e.target.value)} disabled={sending} />
        {errors.apellidos && <span className="field-error">{errors.apellidos}</span>}
      </label>
      <AudioField
        label="Audio de referencia"
        slug="referencia"
        accept={accept}
        file={referencia}
        error={errors.referencia}
        disabled={sending}
        allowRecording={canRecord}
        onChange={setReferencia}
      />
      <AudioField
        label="Audio de prueba"
        slug="prueba"
        accept={accept}
        file={prueba}
        error={errors.prueba}
        disabled={sending}
        allowRecording={canRecord}
        onChange={setPrueba}
      />
      <small>
        Formatos: {config.allowed_extensions.join(", ")} · máximo {config.max_upload_mb} MB por archivo
      </small>
      {sending && <progress value={progress} max={100} />}
      {submitError && <p className="error">{submitError}</p>}
      <button type="submit" disabled={sending}>
        {sending ? `Subiendo… ${progress}%` : "Enviar"}
      </button>
    </form>
  );
}
