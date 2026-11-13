import { useEffect, useState } from "react";
import { getConfig, type AppConfig } from "./api";
import FormularioEnvio from "./components/FormularioEnvio";

const FALLBACK: AppConfig = { allowed_extensions: ["wav", "mp3", "flac"], max_upload_mb: 200 };

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => setConfig(FALLBACK));
  }, []);

  return (
    <main>
      <h1>Envío de audios</h1>
      {config ? <FormularioEnvio config={config} /> : <p>Cargando…</p>}
    </main>
  );
}
