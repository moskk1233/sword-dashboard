import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBottomBar,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiComboBox,
  EuiDescribedFormGroup,
  EuiDescriptionList,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiHealth,
  EuiLoadingSpinner,
  EuiRange,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import {
  ATTACK_FAMILIES,
  ATTACK_FAMILY_KEYS,
  FcmDeviceToken,
  FcmWebConfig,
  NotifierStatus,
  SAMPLE_ATTACK,
  SwordSettings,
  TEMPLATE_VARIABLES,
  getSeverity,
  renderTemplate,
  templateValues,
} from '../../common';
import { SettingsPatch, errorText } from '../api';
import { AppContext } from '../app';
import { Section, formatTime, fromNow } from '../components/common';
import { SecretField, SecretState, initialSecret, secretPatch } from '../settings/secret_field';

const sampleValues = templateValues(
  SAMPLE_ATTACK,
  getSeverity(SAMPLE_ATTACK.confidence),
  '04/10/2026, 14:32:10'
);

const FamilyPicker = ({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) => (
  <EuiComboBox
    fullWidth
    placeholder="All attack types"
    options={ATTACK_FAMILY_KEYS.map((k) => ({ label: ATTACK_FAMILIES[k].label, value: k }))}
    selectedOptions={value.map((k) => ({
      label: ATTACK_FAMILIES[k as keyof typeof ATTACK_FAMILIES]?.label ?? k,
      value: k,
    }))}
    onChange={(o) => onChange(o.map((x) => x.value!))}
  />
);

const ConfidenceRange = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <EuiRange
    fullWidth
    min={0}
    max={100}
    step={5}
    value={Math.round(value * 100)}
    onChange={(e) => onChange(Number((e.target as HTMLInputElement).value) / 100)}
    showInput
    append="%"
    showTicks
    tickInterval={25}
  />
);

const TemplateHelp = () => (
  <EuiText size="xs" color="subdued">
    Variables:{' '}
    {TEMPLATE_VARIABLES.map((v, i) => (
      <React.Fragment key={v.name}>
        <EuiToolTip content={v.description}>
          <code>{`{${v.name}}`}</code>
        </EuiToolTip>
        {i < TEMPLATE_VARIABLES.length - 1 ? ' ' : ''}
      </React.Fragment>
    ))}
  </EuiText>
);

const ChannelStatusView = ({
  label,
  s,
}: {
  label: string;
  s: NotifierStatus['fcm'];
}) => (
  <EuiDescriptionList
    compressed
    type="column"
    listItems={[
      { title: `${label} sent`, description: String(s.sent) },
      { title: 'Failed', description: String(s.failed) },
      { title: 'Rate-limited', description: String(s.suppressed) },
      { title: 'Last sent', description: s.lastSentAt ? fromNow(s.lastSentAt) : '-' },
      {
        title: 'Last error',
        description: s.lastError ? (
          <EuiText size="xs" color="danger">
            {s.lastError}
          </EuiText>
        ) : (
          '-'
        ),
      },
    ]}
  />
);

export const SettingsPage = ({
  ctx,
  onSaved,
}: {
  ctx: AppContext;
  onSaved: (s: SwordSettings) => void;
}) => {
  const { api, core } = ctx;
  const toasts = core.notifications.toasts;
  const [saved, setSaved] = useState<SwordSettings | null>(null);
  const [form, setForm] = useState<SwordSettings | null>(null);
  const [serviceAccount, setServiceAccount] = useState<SecretState>(initialSecret());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [status, setStatus] = useState<NotifierStatus | null>(null);
  const [newDevice, setNewDevice] = useState<FcmDeviceToken>({ label: '', token: '' });

  const load = useCallback(async () => {
    try {
      const s = await api.settings();
      setSaved(s);
      setForm(s);
      setServiceAccount(initialSecret());
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () =>
      api
        .notifierStatus()
        .then(setStatus)
        .catch(() => undefined);
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [api]);

  const patch = useMemo((): SettingsPatch | null => {
    if (!form) return null;
    const { serviceAccountSet, serviceAccount: _sa, projectId, clientEmail, ...fcm } = form.fcm;
    return {
      fcm: { ...fcm, serviceAccount: secretPatch(serviceAccount) },
      dashboard: form.dashboard,
    };
  }, [form, serviceAccount]);

  const dirty = useMemo(
    () =>
      Boolean(form && saved) &&
      (JSON.stringify(form) !== JSON.stringify(saved) ||
        secretPatch(serviceAccount) !== undefined),
    [form, saved, serviceAccount]
  );

  if (error) {
    return (
      <EuiCallOut title="Unable to load settings" color="danger" iconType="alert">
        {error}
      </EuiCallOut>
    );
  }
  if (!form || !patch) {
    return (
      <div className="swordCenter">
        <EuiLoadingSpinner size="xl" />
      </div>
    );
  }

  const fcm = form.fcm;
  const setFcm = (p: Partial<SwordSettings['fcm']>) => setForm({ ...form, fcm: { ...fcm, ...p } });
  const web = fcm.webConfig;
  const setWeb = (p: Partial<FcmWebConfig>) =>
    setFcm({ webConfig: { ...(web ?? {}), ...p } as FcmWebConfig });
  const setDash = (p: Partial<SwordSettings['dashboard']>) =>
    setForm({ ...form, dashboard: { ...form.dashboard, ...p } });

  const save = async () => {
    setSaving(true);
    try {
      const s = await api.saveSettings(patch);
      setSaved(s);
      setForm(s);
      setServiceAccount(initialSecret());
      onSaved(s);
      toasts.addSuccess('SWORD settings saved');
    } catch (e) {
      toasts.addDanger({ title: 'Settings were not saved', text: errorText(e) });
    } finally {
      setSaving(false);
    }
  };

  const test = async (channel: 'fcm') => {
    setTesting(channel);
    try {
      const r = await api.testChannel(channel, patch);
      if (r.ok) toasts.addSuccess({ title: 'Test notification sent', text: r.message });
      else toasts.addDanger({ title: 'Test notification failed', text: r.message });
    } catch (e) {
      toasts.addDanger({ title: 'Test notification failed', text: errorText(e) });
    } finally {
      setTesting(null);
    }
  };

  const saAvailable = fcm.serviceAccountSet
    ? serviceAccount.action !== 'remove'
    : Boolean(serviceAccount.value);
  const invalidTokens = status?.fcm.invalidTokens ?? [];

  return (
    <>
      {form.updatedAt && (
        <EuiText size="xs" color="subdued" textAlign="right">
          Last changed {formatTime(form.updatedAt)} by <strong>{form.updatedBy}</strong>
        </EuiText>
      )}
      <EuiSpacer size="s" />

      {/* ---------------- FCM ---------------- */}
      <Section
        title="Web Notification (Firebase Cloud Messaging)"
        icon="globe"
        description="Push notifications to browsers / desktop clients even when the dashboard is closed."
        action={
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                iconType="play"
                onClick={() => test('fcm')}
                isLoading={testing === 'fcm'}
                isDisabled={!saAvailable || !fcm.deviceTokens.length}
              >
                Send test
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiSwitch
                label={fcm.enabled ? 'Enabled' : 'Disabled'}
                checked={fcm.enabled}
                onChange={(e) => setFcm({ enabled: e.target.checked })}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        }
      >
        <EuiDescribedFormGroup
          fullWidth
          title={<h4>Firebase project</h4>}
          description={
            <>
              In the Firebase console open <em>Project settings → Service accounts</em> and generate
              a private key. The JSON is encrypted on the server and never shown again.
            </>
          }
        >
          <EuiFormRow label="Service account JSON" fullWidth>
            <SecretField
              multiline
              isSet={Boolean(fcm.serviceAccountSet)}
              state={serviceAccount}
              onChange={setServiceAccount}
              placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "..."}'
              configuredText={
                <EuiText size="xs" color="subdued">
                  {fcm.projectId} · {fcm.clientEmail}
                </EuiText>
              }
            />
          </EuiFormRow>
        </EuiDescribedFormGroup>

        <EuiDescribedFormGroup
          fullWidth
          title={<h4>Browser registration (web push)</h4>}
          description={
            <>
              Lets SOC users turn on alerts from their own browser with one click (the{' '}
              <strong>Enable alerts</strong> button in the header). Paste the Firebase{' '}
              <em>Web app config</em> and the <em>Web Push certificate (VAPID key)</em> — these are
              public values, not secrets.
            </>
          }
        >
          <EuiFlexGroup gutterSize="s" wrap>
            <EuiFlexItem style={{ minWidth: 220 }}>
              <EuiFormRow label="apiKey" fullWidth>
                <EuiFieldText
                  fullWidth
                  value={web?.apiKey ?? ''}
                  onChange={(e) => setWeb({ apiKey: e.target.value })}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem style={{ minWidth: 160 }}>
              <EuiFormRow label="projectId" fullWidth>
                <EuiFieldText
                  fullWidth
                  value={web?.projectId ?? ''}
                  onChange={(e) => setWeb({ projectId: e.target.value })}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem style={{ minWidth: 160 }}>
              <EuiFormRow label="messagingSenderId" fullWidth>
                <EuiFieldText
                  fullWidth
                  value={web?.messagingSenderId ?? ''}
                  onChange={(e) => setWeb({ messagingSenderId: e.target.value })}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem style={{ minWidth: 220 }}>
              <EuiFormRow label="appId" fullWidth>
                <EuiFieldText
                  fullWidth
                  value={web?.appId ?? ''}
                  onChange={(e) => setWeb({ appId: e.target.value })}
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiFormRow label="VAPID key (Web Push certificate)" fullWidth>
            <EuiFieldText
              fullWidth
              value={fcm.vapidKey ?? ''}
              onChange={(e) => setFcm({ vapidKey: e.target.value })}
              placeholder="B..."
              className="swordMono"
            />
          </EuiFormRow>
        </EuiDescribedFormGroup>

        <EuiDescribedFormGroup
          fullWidth
          title={<h4>FCM Tokens</h4>}
          description="Registration tokens of the devices / browsers that should receive SWORD alerts."
        >
          {fcm.deviceTokens.length > 0 && (
            <div className="swordList">
              {fcm.deviceTokens.map((d, i) => (
                <div className="swordList__row" key={`${d.label}-${i}`}>
                  <span>
                    <strong>{d.label}</strong>{' '}
                    {invalidTokens.includes(d.label) && (
                      <EuiBadge color="danger">Invalid / expired</EuiBadge>
                    )}
                  </span>
                  <code className="swordList__sig" title={d.token}>
                    {d.token.slice(0, 18)}…{d.token.slice(-8)}
                  </code>
                  <EuiButtonIcon
                    iconType="trash"
                    color="danger"
                    aria-label="Remove token"
                    onClick={() =>
                      setFcm({ deviceTokens: fcm.deviceTokens.filter((_, idx) => idx !== i) })
                    }
                  />
                </div>
              ))}
            </div>
          )}
          <EuiSpacer size="s" />
          <EuiFlexGroup gutterSize="s" responsive={false} wrap>
            <EuiFlexItem grow={1} style={{ minWidth: 120 }}>
              <EuiFieldText
                placeholder="Label (e.g. SOC laptop)"
                value={newDevice.label}
                onChange={(e) => setNewDevice({ ...newDevice, label: e.target.value })}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={3} style={{ minWidth: 220 }}>
              <EuiFieldText
                placeholder="FCM Token"
                value={newDevice.token}
                onChange={(e) => setNewDevice({ ...newDevice, token: e.target.value })}
                className="swordMono"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                iconType="plusInCircle"
                isDisabled={!newDevice.label.trim() || newDevice.token.trim().length < 20}
                onClick={() => {
                  setFcm({
                    deviceTokens: [
                      ...fcm.deviceTokens,
                      { label: newDevice.label.trim(), token: newDevice.token.trim() },
                    ],
                  });
                  setNewDevice({ label: '', token: '' });
                }}
              >
                Add
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiDescribedFormGroup>

        <EuiDescribedFormGroup
          fullWidth
          title={<h4>Message & filters</h4>}
          description={<TemplateHelp />}
        >
          <EuiFormRow label="Title" fullWidth>
            <EuiFieldText
              fullWidth
              value={fcm.title}
              onChange={(e) => setFcm({ title: e.target.value })}
            />
          </EuiFormRow>
          <EuiFormRow
            label="Body"
            fullWidth
            helpText={<>Preview: {renderTemplate(fcm.body, sampleValues)}</>}
          >
            <EuiFieldText
              fullWidth
              value={fcm.body}
              onChange={(e) => setFcm({ body: e.target.value })}
            />
          </EuiFormRow>
          <EuiFormRow label="Re-notify the same incident after" fullWidth>
            <EuiFieldNumber
              min={0}
              max={86400}
              value={fcm.cooldownSeconds}
              onChange={(e) => setFcm({ cooldownSeconds: Number(e.target.value) })}
              append="seconds"
            />
          </EuiFormRow>
          <EuiFormRow label="Minimum model confidence" fullWidth>
            <ConfidenceRange
              value={fcm.minConfidence}
              onChange={(v) => setFcm({ minConfidence: v })}
            />
          </EuiFormRow>
          <EuiFormRow label="Attack types" fullWidth helpText="Leave empty to notify every type">
            <FamilyPicker value={fcm.families} onChange={(v) => setFcm({ families: v })} />
          </EuiFormRow>
        </EuiDescribedFormGroup>
      </Section>

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="m" wrap>
        {/* ---------------- Dashboard ---------------- */}
        <EuiFlexItem style={{ minWidth: 320 }}>
          <Section title="Dashboard" icon="dashboardApp" description="Applies to every SWORD user.">
            <EuiFormRow label="Auto-refresh / live alert interval" fullWidth>
              <EuiFieldNumber
                min={5}
                max={3600}
                value={form.dashboard.refreshSeconds}
                onChange={(e) => setDash({ refreshSeconds: Number(e.target.value) })}
                append="seconds"
              />
            </EuiFormRow>
            <EuiFormRow fullWidth>
              <EuiSwitch
                label="Show a pop-up in the dashboard when a new attack is detected"
                checked={form.dashboard.liveToasts}
                onChange={(e) => setDash({ liveToasts: e.target.checked })}
              />
            </EuiFormRow>
          </Section>
        </EuiFlexItem>

        {/* ---------------- Notifier status ---------------- */}
        <EuiFlexItem style={{ minWidth: 320 }}>
          <Section
            title="Notifier status"
            icon="pulse"
            description="Runs on the dashboards server; polls the Wazuh indexer for new ML detections."
          >
            {status ? (
              <>
                <EuiHealth
                  color={status.running ? (status.lastError ? 'warning' : 'success') : 'subdued'}
                >
                  {status.running ? `Running every ${status.intervalSeconds}s` : 'Stopped'}
                  {status.lastRunAt ? ` · last run ${fromNow(status.lastRunAt)}` : ''}
                </EuiHealth>
                {status.lastError && (
                  <EuiText size="xs" color="danger">
                    {status.lastError}
                  </EuiText>
                )}
                <EuiSpacer size="s" />
                <EuiText size="xs" color="subdued">
                  Processed {status.processed} detection(s) since start
                  {status.cursor ? ` · cursor ${formatTime(status.cursor)}` : ''}
                </EuiText>
                <EuiSpacer size="s" />
                <EuiFlexGroup gutterSize="l" wrap>
                  <EuiFlexItem>
                    <ChannelStatusView label="FCM" s={status.fcm} />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </>
            ) : (
              <EuiLoadingSpinner />
            )}
          </Section>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="xxl" />
      <EuiSpacer size="xxl" />

      {dirty && (
        <EuiBottomBar>
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiText size="s" color="ghost">
                You have unsaved changes
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty color="ghost" onClick={load}>
                    Discard
                  </EuiButtonEmpty>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    fill
                    color="secondary"
                    iconType="save"
                    onClick={save}
                    isLoading={saving}
                  >
                    Save settings
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiBottomBar>
      )}
    </>
  );
};
