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
    <div className="flex min-h-screen flex-col items-center justify-center bg-frame px-4 py-10">
      <p className="mb-5 flex items-center gap-2 text-dense font-semibold tracking-[0.08em] text-frame-fg uppercase">
        <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-frame-3" aria-hidden>
          <span className="h-2 w-2 rounded-xs bg-signal" />
        </span>
        PharmaCore
      </p>
      <div className="w-full max-w-sm animate-enter rounded-xl border border-frame-line bg-surface px-6 pt-6 pb-7 text-fg shadow-overlay">
        <h1 className="text-title leading-tight font-semibold tracking-[-0.02em] text-fg">Sign in</h1>
        <p className="mt-1.5 text-dense text-fg-3">Till, stock and records for the pharmacy. Your role decides what you can open.</p>

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

      </div>
      {import.meta.env.DEV ? (
        <p className="mt-5 text-xs text-frame-fg-2">
          Development default: <code>admin</code> / <code>admin123</code>. Change it from the Account page.
        </p>
      ) : null}
    </div>
  );
}
