import React, { useState } from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiFieldPassword,
  EuiForm,
  EuiFormRow,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { CoreStart } from '../../../../src/core/public';
import { AccessInfo } from '../../common';
import { SwordApi, errorText } from '../api';

const RULES: Array<[RegExp, string]> = [
  [/.{10,}/, 'At least 10 characters'],
  [/[a-z]/, 'A lowercase letter'],
  [/[A-Z]/, 'An uppercase letter'],
  [/[0-9]/, 'A digit'],
  [/[^A-Za-z0-9]/, 'A symbol'],
];

interface Props {
  core: CoreStart;
  api: SwordApi;
  access: AccessInfo;
  forced?: boolean;
}

/** Ends the session after a password change so the user signs in again with the new password. */
async function signOut(core: CoreStart) {
  try {
    await core.http.post('/auth/logout');
    window.location.href = core.http.basePath.prepend('/app/login');
  } catch {
    window.location.reload();
  }
}

export const ChangePasswordPage = ({ core, api, access, forced }: Props) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const checks = RULES.map(([re, label]) => ({ label, ok: re.test(next) }));
  const containsUser = Boolean(next) && next.toLowerCase().includes(access.username.toLowerCase());
  const valid =
    checks.every((c) => c.ok) &&
    next === confirm &&
    Boolean(current) &&
    next !== current &&
    !containsUser;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      setDone(true);
      setTimeout(() => signOut(core), 2500);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="swordPasswordPage">
      <EuiPanel paddingSize="l" className="swordPasswordPage__card">
        <div className="swordPasswordPage__icon">
          <EuiIcon type="lock" size="xl" color="ghost" />
        </div>
        <EuiTitle size="m">
          <h2>{forced ? 'Set your own password' : 'Change password'}</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="s" color="subdued">
          {forced ? (
            <p>
              Welcome to SWORD, <strong>{access.username}</strong>. For security, the password your
              administrator created must be replaced before you can access attack data.
            </p>
          ) : (
            <p>
              Signed in as <strong>{access.username}</strong>.
            </p>
          )}
        </EuiText>
        <EuiSpacer />

        {!access.canChangePassword ? (
          <EuiCallOut
            color="warning"
            iconType="alert"
            title="This account cannot change its password here"
          />
        ) : done ? (
          <EuiCallOut color="success" iconType="check" title="Password changed">
            You will be signed out. Sign in again with your new password.
          </EuiCallOut>
        ) : (
          <EuiForm component="form" onSubmit={submit}>
            {error && (
              <>
                <EuiCallOut color="danger" iconType="alert" title={error} size="s" />
                <EuiSpacer size="m" />
              </>
            )}
            <EuiFormRow label="Current password" fullWidth>
              <EuiFieldPassword
                fullWidth
                type="dual"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
              />
            </EuiFormRow>
            <EuiFormRow label="New password" fullWidth>
              <EuiFieldPassword
                fullWidth
                type="dual"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
              />
            </EuiFormRow>
            <EuiFormRow
              label="Confirm new password"
              fullWidth
              isInvalid={Boolean(confirm) && confirm !== next}
              error="Passwords do not match"
            >
              <EuiFieldPassword
                fullWidth
                type="dual"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                isInvalid={Boolean(confirm) && confirm !== next}
                autoComplete="new-password"
              />
            </EuiFormRow>
            <EuiSpacer size="s" />
            <ul className="swordChecklist">
              {checks.map((c) => (
                <li key={c.label} className={c.ok ? 'isOk' : ''}>
                  <EuiIcon
                    type={c.ok ? 'checkInCircleFilled' : 'dot'}
                    color={c.ok ? 'success' : 'subdued'}
                  />{' '}
                  {c.label}
                </li>
              ))}
              <li className={next && !containsUser ? 'isOk' : ''}>
                <EuiIcon
                  type={next && !containsUser ? 'checkInCircleFilled' : 'dot'}
                  color={next && !containsUser ? 'success' : 'subdued'}
                />{' '}
                Does not contain your username
              </li>
              <li className={next && next !== current ? 'isOk' : ''}>
                <EuiIcon
                  type={next && next !== current ? 'checkInCircleFilled' : 'dot'}
                  color={next && next !== current ? 'success' : 'subdued'}
                />{' '}
                Different from the current password
              </li>
            </ul>
            <EuiSpacer />
            <EuiButton type="submit" fill fullWidth isDisabled={!valid} isLoading={submitting}>
              Change password
            </EuiButton>
          </EuiForm>
        )}
      </EuiPanel>
    </div>
  );
};
