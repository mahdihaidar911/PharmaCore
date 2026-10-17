import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageShell, ScrollBox } from "../components/PageShell";
import { Alert, Badge, ConfirmDialog, EmptyState, Field, Modal, Spinner, Status } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api, parseServerDate, type ManagedUser, type Role } from "../lib/api";

const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Full access, including users, profit, restores and MoPH import." },
  pharmacist: { label: "Pharmacist", description: "Stock, returns, discounts, exchange rate and sales reports." },
  cashier: { label: "Cashier", description: "Sell, reprint receipts, link barcodes, view stock and expiry." },
};

type Editing = { mode: "create" } | { mode: "edit"; user: ManagedUser } | { mode: "password"; user: ManagedUser } | null;

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [toggling, setToggling] = useState<ManagedUser | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"));
  }, []);

  useEffect(load, [load]);

  async function toggleActive() {
    if (!toggling) return;
    setBusy(true);
    setError("");
    try {
      await api.updateUser(toggling.id, { is_active: !toggling.is_active });
      setNotice(`${toggling.username} ${toggling.is_active ? "disabled" : "re-enabled"}.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
      setToggling(null);
    }
  }

  return (
    <PageShell
      title="Users"
      description="Staff accounts and roles. Each person should have their own login so sales and stock changes are traceable."
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ mode: "create" })}>
          Add user
        </button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}

        <div className="sheet min-h-0 flex-1 overflow-hidden">
          <ScrollBox className="h-full">
            {!users ? (
              <Spinner className="p-6" />
            ) : users.length === 0 ? (
              <EmptyState title="No users" />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th className="hidden md:table-cell">Last sign-in</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={u.is_active ? "" : "opacity-60"}>
                      <td>
                        <p className="font-medium text-fg">{u.full_name || u.username}</p>
                        <p className="text-xs text-fg-3">
                          @{u.username}
                          {u.id === me?.id ? " · you" : ""}
                        </p>
                      </td>
                      <td>
                        <Badge tone={u.role === "owner" ? "brand" : "neutral"}>{ROLE_INFO[u.role]?.label ?? u.role}</Badge>
                      </td>
                      <td>{u.is_active ? <Status tone="ok">Active</Status> : <Status tone="muted" icon="close">Disabled</Status>}</td>
                      <td className="hidden font-mono text-dense text-fg-3 md:table-cell">
                        {u.last_login_at ? parseServerDate(u.last_login_at).toLocaleString() : "Never"}
                      </td>
                      <td>
                        <div className="flex justify-end gap-1.5">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing({ mode: "edit", user: u })}>
                            Edit
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing({ mode: "password", user: u })}>
                            Reset password
                          </button>
                          {u.id !== me?.id ? (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setToggling(u)}>
                              {u.is_active ? "Disable" : "Enable"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ScrollBox>
        </div>
      </div>

      {editing ? (
        <UserFormModal
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setNotice(message);
            setError("");
            load();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(toggling)}
        title={toggling?.is_active ? "Disable user?" : "Enable user?"}
        message={
          toggling?.is_active
            ? `${toggling.username} will be signed out immediately and will not be able to sign in. Their past sales remain in the records.`
            : `${toggling?.username} will be able to sign in again.`
        }
        confirmLabel={toggling?.is_active ? "Disable" : "Enable"}
        destructive={toggling?.is_active}
        busy={busy}
        onConfirm={toggleActive}
        onCancel={() => setToggling(null)}
      />
    </PageShell>
  );
}

function UserFormModal({ editing, onClose, onSaved }: { editing: NonNullable<Editing>; onClose: () => void; onSaved: (message: string) => void }) {
  const existing = editing.mode === "create" ? null : editing.user;
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [role, setRole] = useState<Role>(existing?.role ?? "cashier");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const title = editing.mode === "create" ? "Add user" : editing.mode === "edit" ? `Edit ${existing?.username}` : `Reset password for ${existing?.username}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing.mode === "create") {
        await api.createUser({ username: username.trim(), full_name: fullName.trim(), role, password });
        onSaved(`User ${username.trim()} created.`);
      } else if (editing.mode === "edit") {
        await api.updateUser(editing.user.id, { full_name: fullName.trim(), role });
        onSaved(`${editing.user.username} updated.`);
      } else {
        await api.resetUserPassword(editing.user.id, password);
        onSaved(`Password reset for ${editing.user.username}. Give them the new password in person.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="user-form" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        {editing.mode === "create" ? (
          <Field label="Username" hint="Letters, numbers, dot, dash or underscore.">
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} required />
          </Field>
        ) : null}
        {editing.mode !== "password" ? (
          <>
            <Field label="Full name">
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <fieldset>
              <legend className="field-label">Role</legend>
              <div className="space-y-2">
                {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
                  <label key={r} className={`flex cursor-pointer gap-3 rounded-sm border p-3 ${role === r ? "border-fg bg-canvas" : "border-line hover:bg-canvas"}`}>
                    <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-1" />
                    <span>
                      <span className="block text-sm font-medium">{ROLE_INFO[r].label}</span>
                      <span className="block text-xs text-fg-3">{ROLE_INFO[r].description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        ) : null}
        {editing.mode !== "edit" ? (
          <Field label={editing.mode === "create" ? "Initial password" : "New password"} hint="At least 6 characters.">
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} autoComplete="new-password" required />
          </Field>
        ) : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
      </form>
    </Modal>
  );
}
