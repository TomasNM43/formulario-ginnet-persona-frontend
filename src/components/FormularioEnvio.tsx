import { useEffect, useRef, useState, type FormEvent } from "react";
import { crearEnvio, getEnvio, getFrases, verifyPhrase, type AppConfig, type Envio, type EnvioCreado, type Frase, type VerifyResult } from "../api";
import AudioField from "./AudioField";

type Verif = { status: "checking" } | { status: "done"; result: VerifyResult } | { status: "error"; message: string };

const POLL_MS = 3000;

function validateFile(file: File | null, cfg: AppConfig): string | null {
  if (!file) return "Selecciona un archivo";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!cfg.allowed_extensions.includes(ext)) return `Formato no permitido (${cfg.allowed_extensions.join(", ")})`;
  if (file.size === 0) return "El archivo está vacío";
  if (file.size > cfg.max_upload_mb * 1024 * 1024) return `Supera el máximo de ${cfg.max_upload_mb} MB`;
  return null;
}

export default function FormularioEnvio({ config }: { config: AppConfig }) {
  const [frases, setFrases] = useState<Frase[] | null>(null);
  const [frasesError, setFrasesError] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [verifs, setVerifs] = useState<Record<string, Verif | undefined>>({});
  const verifToken = useRef<Record<string, number>>({});
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

  useEffect(() => {
    getFrases()
      .then(setFrases)
      .catch((e) => setFrasesError((e as Error).message));
  }, []);

  async function onPhraseFile(id: string, file: File | null) {
    const token = (verifToken.current[id] ?? 0) + 1;
    verifToken.current[id] = token;
    setFiles((f) => ({ ...f, [id]: file }));
    setErrors((e) => ({ ...e, [id]: null }));
    if (!file) return setVerifs((v) => ({ ...v, [id]: undefined }));
    const fileError = validateFile(file, config);
    if (fileError) return setVerifs((v) => ({ ...v, [id]: { status: "error", message: fileError } }));
    setVerifs((v) => ({ ...v, [id]: { status: "checking" } }));
    try {
      const result = await verifyPhrase(id, file);
      if (verifToken.current[id] === token) setVerifs((v) => ({ ...v, [id]: { status: "done", result } }));
    } catch (err) {
      if (verifToken.current[id] === token)
        setVerifs((v) => ({ ...v, [id]: { status: "error", message: (err as Error).message } }));
    }
  }

  const allValid =
    !!frases?.length &&
    frases.every((f) => {
      const v = verifs[f.id];
      return v?.status === "done" && v.result.match;
    });

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const errs: Record<string, string | null> = {};
    for (const f of frases ?? []) {
      const v = verifs[f.id];
      errs[f.id] = !files[f.id]
        ? "Graba o selecciona el audio de esta frase"
        : v?.status === "done" && v.result.match
          ? null
          : "La frase debe verificarse correctamente";
    }
    setErrors(errs);
    if (Object.values(errs).some(Boolean) || !frases?.length) return;

    setSubmitError(null);
    setSending(true);
    setProgress(0);
    try {
      setEnvio(
        await crearEnvio(
          {
            audios: frases.map((f) => ({ fraseId: f.id, file: files[f.id]! })),
          },
          setProgress,
        ),
      );
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setEnvio(null);
    setEstado(null);
    setFiles({});
    setVerifs({});
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
      {frasesError && <p className="error">No se pudieron cargar las frases: {frasesError}</p>}
      {!frases && !frasesError && <p>Cargando frases…</p>}
      {frases?.map((f) => {
        const v = verifs[f.id];
        return (
          <div key={f.id}>
            <AudioField
              label={`Frase ${f.orden}: “${f.frase}”`}
              slug={`frase-${f.orden}`}
              accept={accept}
              file={files[f.id] ?? null}
              error={errors[f.id]}
              disabled={sending}
              allowRecording={canRecord}
              onChange={(file) => void onPhraseFile(f.id, file)}
            />
            {v?.status === "checking" && <small className="hint">Verificando…</small>}
            {v?.status === "error" && <span className="field-error">{v.message}</span>}
            {v?.status === "done" && v.result.match && (
              <small className="ok">✔ Frase correcta ({Math.round(v.result.similarity * 100)}%)</small>
            )}
            {v?.status === "done" && !v.result.match && (
              <span className="field-error">
                No coincide ({Math.round(v.result.similarity * 100)}%). Escuchamos: “{v.result.transcription || "(silencio)"}”. Graba de nuevo.
              </span>
            )}
          </div>
        );
      })}
      <small>
        Formatos: {config.allowed_extensions.join(", ")} · máximo {config.max_upload_mb} MB por archivo
      </small>
      {sending && <progress value={progress} max={100} />}
      {submitError && <p className="error">{submitError}</p>}
      <button type="submit" disabled={sending || !allValid}>
        {sending ? `Subiendo… ${progress}%` : "Enviar"}
      </button>
    </form>
  );
}
