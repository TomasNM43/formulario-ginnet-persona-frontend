import { useEffect, useRef, useState } from "react";
import { blobToWav } from "../wav";

interface Props {
  label: string;
  slug: string;
  accept: string;
  file: File | null;
  error: string | null | undefined;
  disabled: boolean;
  allowRecording: boolean;
  onChange: (file: File | null) => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function AudioField({ label, slug, accept, file, error, disabled, allowRecording, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(
    () => () => {
      window.clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    setMsg(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMsg("Este navegador no permite grabar (se requiere HTTPS).");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        window.clearInterval(timer.current);
        setRecording(false);
        try {
          const wav = await blobToWav(new Blob(chunks, { type: rec.mimeType }));
          onChange(new File([wav], `${slug}-grabacion.wav`, { type: "audio/wav" }));
        } catch {
          setMsg("No se pudo procesar la grabación. Intenta de nuevo o sube un archivo.");
        }
      };
      rec.start();
      recorder.current = rec;
      setSeconds(0);
      setRecording(true);
      timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setMsg("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
    }
  }

  return (
    <fieldset disabled={disabled}>
      <legend>{label}</legend>
      <input
        type="file"
        accept={accept}
        disabled={recording}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        aria-label={`${label}: archivo`}
      />
      {allowRecording && (
        <div className="recorder">
          {recording ? (
            <button type="button" onClick={() => recorder.current?.stop()}>
              ⏹ Detener ({fmt(seconds)})
            </button>
          ) : (
            <button type="button" onClick={start}>
              🎙 {file ? "Grabar de nuevo" : "Grabar"}
            </button>
          )}
        </div>
      )}
      {url && !recording && <audio controls src={url} />}
      {file && !recording && (
        <small>
          {file.name} · {(file.size / 1048576).toFixed(2)} MB
        </small>
      )}
      {msg && <span className="field-error">{msg}</span>}
      {error && <span className="field-error">{error}</span>}
    </fieldset>
  );
}
