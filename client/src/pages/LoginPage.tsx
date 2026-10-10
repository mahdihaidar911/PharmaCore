import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { Alert } from "../components/ui";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { user, loading, login, sessionExpired } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={user.role === "cashier" ? "/pos" : "/"} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <p className="flex items-center gap-1.5 text-2xs font-semibold tracking-[0.12em] text-ink-3 uppercase">
          <span className="h-2 w-2 bg-lime-400" aria-hidden />
          PharmaCore
        </p>
        <h1 className="mt-2 border-b-2 border-ink pb-3 font-serif text-[2rem] leading-tight font-semibold text-ink">Sign in</h1>
        <p className="mt-3 text-dense text-ink-2">Till, stock and records for the pharmacy. Your role decides what you can open.</p>

        {sessionExpired ? (
          <Alert tone="warning" className="mt-6">
            Your session ended. Please sign in again.
          </Alert>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="field-label">Username</span>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label className="block">
            <span className="field-label">Password</span>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <button type="submit" disabled={submitting} className="btn btn-primary btn-lg w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {import.meta.env.DEV ? (
          <p className="mt-6 text-xs text-ink-3">
            Development default: <code>admin</code> / <code>admin123</code>. Change it from the Account page.
          </p>
        ) : null}
      </div>
    </div>
  );
}
