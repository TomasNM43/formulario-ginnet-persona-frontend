import { useEffect, useState } from "react";
import { clearSession, getConfig, getMe, getToken, type AppConfig, type User } from "./api";
import FormularioEnvio from "./components/FormularioEnvio";
import Login from "./components/Login";

const FALLBACK: AppConfig = { allowed_extensions: ["wav", "mp3", "flac"], max_upload_mb: 200 };

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(!!getToken());

  useEffect(() => {
    getConfig().then(setConfig).catch(() => setConfig(FALLBACK));
  }, []);

  useEffect(() => {
    if (getToken()) {
      getMe()
        .then(setUser)
        .catch(() => clearSession())
        .finally(() => setChecking(false));
    }
    const expired = () => setUser(null);
    window.addEventListener("auth-expired", expired);
    return () => window.removeEventListener("auth-expired", expired);
  }, []);

  function logout() {
    clearSession();
    setUser(null);
  }

  return (
    <main>
      <h1>Envío de audios</h1>
      {user && (
        <p className="userbar">
          <span>
            {user.nombres} {user.apellidos}
          </span>
          <button type="button" className="secondary" onClick={logout}>
            Cerrar sesión
          </button>
        </p>
      )}
      {checking || !config ? (
        <p>Cargando…</p>
      ) : user ? (
        <FormularioEnvio key={user.correo} config={config} />
      ) : (
        <Login onLogin={setUser} />
      )}
    </main>
  );
}
