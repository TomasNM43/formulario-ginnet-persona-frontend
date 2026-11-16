import { useState, type FormEvent } from "react";
import { login, type User } from "../api";

export default function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!correo.trim() || !clave.trim()) return setError("Ingresa tu correo y tu código de alumno");
    setError(null);
    setBusy(true);
    try {
      onLogin(await login(correo.trim(), clave.trim()));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <label>
        Correo
        <input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} disabled={busy} />
      </label>
      <label>
        Código de alumno
        <input type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} disabled={busy} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
