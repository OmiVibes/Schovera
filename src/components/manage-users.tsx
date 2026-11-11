'use client';
import { classDisplay } from '@/lib/class-display';
import { UiText, useUiText } from '@/components/ui-text';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AccountInput } from '@/lib/account-management';

type Draft = Omit<AccountInput, 'password'>;
type Options = {
  users: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    active: boolean;
  }[];
  classes: { id: string; grade: string; division: string }[];
  students: {
    id: string;
    full_name: string;
    roll_number: string;
    class_id: string;
  }[];
};
const emptyDraft = (): Draft => ({
  requestId: crypto.randomUUID(),
  name: '',
  email: '',
  role: 'parent',
  classIds: [],
  childIds: [],
  confirmPrincipal: false,
});

export function ManageUsers({
  profileId,
  schoolId,
}: {
  profileId: string;
  schoolId: string;
}) {
  const ui = useUiText();
  const db = useMemo(() => createClient(), []);
  const [options, setOptions] = useState<Options | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const storageKey = `schovera:account-request:${schoolId}:${profileId}`;

  async function api(method: string, body?: AccountInput) {
    const { data } = await db.auth.getSession();
    if (!data.session) throw new Error('Please sign in again.');
    const response = await fetch('/api/school/accounts', {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(25000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Object.assign(
        new Error(result.error || 'Account management is unavailable.'),
        { status: response.status },
      );
    return result;
  }
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const value = JSON.parse(saved);
          if (value.requestId && !('password' in value)) {
            setDraft(value);
            setPending(true);
          }
        }
      } catch {
        /* Storage is optional; no password is ever persisted. */
      }
    });
    api('GET')
      .then((result) => {
        if (active) setOptions(result);
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
    // The parent keys this workspace by authenticated identity/school.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function change(values: Partial<Draft>) {
    setDraft((previous) => ({ ...previous, ...values }));
  }
  function toggle(field: 'classIds' | 'childIds', id: string) {
    change({
      [field]: draft[field].includes(id)
        ? draft[field].filter((value) => value !== id)
        : [...draft[field], id],
    });
  }
  const matches =
    options?.users.filter((user) =>
      `${user.full_name} ${user.email} ${user.role}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];

  return (
    <section className="manage-users" aria-labelledby="manage-users-title">
      <header className="section-heading">
        <p className="eyebrow"><UiText source={"SCHOOL ACCOUNTS"} /></p>
        <h2 id="manage-users-title"><UiText source={"School accounts"} /></h2>
        <p>
          <UiText source={"Create an account, choose its portal and connect it to your school. Existing passwords are never changed here."} /></p>
      </header>
      {error && error !== 'Account management is not enabled on this server.' && (
        <p className="error" role="alert">
          {ui(error)}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {ui(notice)}
        </p>
      )}
      {!options && error === 'Account management is not enabled on this server.' ? (
        <section className="account-mode-empty" aria-label={ui('School account access')}>
          <span className="section-icon" aria-hidden="true">S</span>
          <div><h3><UiText source="Account administration is closed here" /></h3>
            <p><UiText source="Existing school accounts can still sign in. Creating accounts requires the separate, guarded administration service. Ask your school administrator to open that service." /></p>
          </div>
        </section>
      ) : !options ? (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              setOptions(await api('GET'));
            } catch (reason) {
              setError((reason as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <UiText source={"Load school accounts"} /></button>
      ) : (
        <>
          <form
            className="card account-create-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              setError('');
              setNotice('');
              setPending(true);
              try {
                sessionStorage.setItem(storageKey, JSON.stringify(draft));
              } catch {
                /* Never save the password. */
              }
              try {
                const result = await api('POST', { ...draft, password });
                try {
                  sessionStorage.removeItem(storageKey);
                } catch {
                  /* Optional storage. */
                }
                setNotice(
                  `Account created for ${draft.email}. ${result.passwordUnchanged ? 'Use the password from the first attempt; a retry does not replace it.' : 'They can sign in with the password you entered; it stays the same until deliberately changed.'}`,
                );
                setPassword('');
                setShowPassword(false);
                setPending(false);
                setDraft(emptyDraft());
                try {
                  setOptions(await api('GET'));
                } catch {
                  setError(
                    'Account created, but the list could not refresh. Reload this page.',
                  );
                }
              } catch (reason) {
                if (
                  [400, 409].includes(
                    (reason as Error & { status?: number }).status ?? 0,
                  )
                ) {
                  setPending(false); // Keep the same request ID: edits cannot overwrite an already-created account.
                  setError((reason as Error).message);
                } else
                  setError(
                    `${(reason as Error).message} Your request is kept for a safe retry.`,
                  );
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3><UiText source={"Add a school account"} /></h3>
            <div className="account-fields">
              <label>
                <UiText source={"Full name"} /><input
                  required
                  minLength={2}
                  maxLength={120}
                  value={draft.name}
                  disabled={pending || busy}
                  onChange={(event) => change({ name: event.target.value })}
                  autoComplete="off"
                />
              </label>
              <label>
                <UiText source={"Email"} /><input
                  required
                  type="email"
                  maxLength={254}
                  value={draft.email}
                  disabled={pending || busy}
                  onChange={(event) => change({ email: event.target.value })}
                  autoComplete="off"
                />
              </label>
              <label>
                <UiText source={"Portal"} /><select
                  value={draft.role}
                  disabled={pending || busy}
                  onChange={(event) =>
                    change({
                      role: event.target.value as Draft['role'],
                      classIds: [],
                      childIds: [],
                      confirmPrincipal: false,
                    })
                  }
                >
                  <option value="parent"><UiText source={"Parent"} /></option>
                  <option value="teacher"><UiText source={"Teacher"} /></option>
                  <option value="principal"><UiText source={"Principal"} /></option>
                </select>
              </label>
              <label>
                <UiText source={"Password"} /><input
                  required
                  type={showPassword ? 'text' : 'password'}
                  minLength={12}
                  maxLength={128}
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  aria-describedby="account-password-help"
                />
              </label>
            </div>
            <label className="account-checkbox">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(event) => setShowPassword(event.target.checked)}
              />
              <UiText source={"Show password"} /></label>
            <p id="account-password-help" className="hint">
              <UiText source={"Use at least 12 characters, with uppercase, lowercase, a number and a symbol. Share it privately with the account holder. Passwords are not displayed in the user list."} /></p>
            {draft.role === 'teacher' && (
              <fieldset disabled={pending || busy}>
                <legend><UiText source={"Choose assigned classes"} /></legend>
                {options.classes.map((klass) => (
                  <label className="account-checkbox" key={klass.id}>
                    <input
                      type="checkbox"
                      checked={draft.classIds.includes(klass.id)}
                      onChange={() => toggle('classIds', klass.id)}
                    />
                    {classDisplay(klass, ui)}
                  </label>
                ))}
                {!options.classes.length && (
                  <p><UiText source={"Add an active class before creating a Teacher account."} /></p>
                )}
              </fieldset>
            )}
            {draft.role === 'parent' && (
              <fieldset disabled={pending || busy}>
                <legend><UiText source={"Choose linked children"} /></legend>
                <div className="account-child-list">
                  {options.students.map((student) => {
                    const klass = options.classes.find(
                      (item) => item.id === student.class_id,
                    );
                    return (
                      <label className="account-checkbox" key={student.id}>
                        <input
                          type="checkbox"
                          checked={draft.childIds.includes(student.id)}
                          onChange={() => toggle('childIds', student.id)}
                        />
                        {student.full_name} ·{' '}
                        {klass ? classDisplay(klass, ui) : ui("Class")} <UiText source={"· Roll "} />{student.roll_number}
                      </label>
                    );
                  })}
                </div>
                {!options.students.length && (
                  <p><UiText source={"Add an active student before creating a Parent account."} /></p>
                )}
              </fieldset>
            )}
            {draft.role === 'principal' && (
              <label className="account-checkbox">
                <input
                  type="checkbox"
                  required
                  checked={draft.confirmPrincipal}
                  disabled={pending || busy}
                  onChange={(event) =>
                    change({ confirmPrincipal: event.target.checked })
                  }
                />
                <UiText source={"I authorize this person to manage this school as a Principal, including creating other school accounts."} /></label>
            )}
            {pending && (
              <p className="hint">
                <UiText source={"This request is locked to avoid duplicates. If interrupted, retry with the original password. Retrying does not reset a password already saved."} /></p>
            )}
            <button
              type="submit"
              disabled={
                busy ||
                (draft.role === 'parent' && !draft.childIds.length) ||
                (draft.role === 'teacher' && !draft.classIds.length)
              }
            >
              {busy
                ? ui("Creating account…")
                : pending
                  ? ui("Retry account creation")
                  : ui("Create account")}
            </button>
          </form>
          <p className="hint account-table-hint">
            <UiText source={"Scroll the user table sideways to see all columns."} /></p>
          <section className="card">
            <h3><UiText source={"School users ("} />{options.users.length})</h3>
            <label>
              <UiText source={"Find a user"} /><input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={ui("Name, email or portal")}
              />
            </label>
            <div className="account-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col"><UiText source={"Name"} /></th>
                    <th scope="col"><UiText source={"Email"} /></th>
                    <th scope="col"><UiText source={"Portal"} /></th>
                    <th scope="col"><UiText source={"Status"} /></th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((user) => (
                    <tr key={user.id}>
                      <td>{user.full_name}</td>
                      <td>{user.email}</td>
                      <td>{ui(user.role)}</td>
                      <td>{user.active ? ui("Active") : ui("Inactive")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!matches.length && <p><UiText source={"No matching school users."} /></p>}
          </section>
        </>
      )}
    </section>
  );
}
