import React, { useCallback, useEffect, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiButton,
  EuiCallOut,
  EuiCodeBlock,
  EuiConfirmModal,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiLink,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { AccessOverview, DEFAULT_ADMIN_ROLE, DEFAULT_SOC_ROLE, ManagedUser } from '../../common';
import { errorText } from '../api';
import { AppContext } from '../app';
import { RoleBadge, Section, formatTime } from '../components/common';

const yes = <EuiIcon type="check" color="success" aria-label="Allowed" />;
const no = <EuiIcon type="cross" color="danger" aria-label="Not allowed" />;

const MATRIX: Array<{ feature: string; admin: boolean; soc: boolean; note?: string }> = [
  { feature: 'Sign in with username / password', admin: true, soc: true },
  { feature: 'View Attack Monitor (trend, types, daily top attack)', admin: true, soc: true },
  { feature: 'View attack history & AI results of every agent', admin: true, soc: true },
  { feature: 'Filter by date / time, agent, attack type, IP', admin: true, soc: true },
  { feature: 'View agents and sensor status', admin: true, soc: true },
  { feature: 'FCM / dashboard settings', admin: true, soc: false },
  { feature: 'Manage SOC members & force password reset', admin: true, soc: false },
  {
    feature: 'Create / delete users, add / remove agents',
    admin: true,
    soc: false,
    note: 'Wazuh native',
  },
  { feature: 'Must change password on first login', admin: false, soc: true },
];

export const AccessPage = ({ ctx }: { ctx: AppContext }) => {
  const { api, core, access } = ctx;
  const toasts = core.notifications.toasts;
  const [overview, setOverview] = useState<AccessOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newMember, setNewMember] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ user: ManagedUser; action: 'reset' | 'remove' } | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await api.accessOverview());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toasts.addSuccess(success);
      await load();
    } catch (e) {
      toasts.addDanger({ title: 'Action failed', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const securityUsersUrl = core.http.basePath.prepend('/app/security-dashboards-plugin#/users');
  const rolesInstalled =
    overview &&
    overview.installedRoles[DEFAULT_SOC_ROLE] &&
    overview.installedRoles[DEFAULT_ADMIN_ROLE];

  const columns: Array<EuiBasicTableColumn<ManagedUser>> = [
    {
      field: 'username',
      name: 'Username',
      render: (u: string) => (
        <strong>
          {u}
          {u === access.username ? ' (you)' : ''}
        </strong>
      ),
    },
    {
      field: 'role',
      name: 'SWORD role',
      render: (r: ManagedUser['role']) => <RoleBadge role={r} />,
    },
    {
      name: 'Password',
      render: (u: ManagedUser) =>
        u.role === 'admin' ? (
          <EuiText size="xs" color="subdued">
            Not required
          </EuiText>
        ) : u.mustChangePassword ? (
          <EuiHealth color="warning">Must change at next login</EuiHealth>
        ) : (
          <EuiHealth color="success">
            Changed {formatTime(u.passwordChangedAt, 'DD MMM YYYY HH:mm')}
          </EuiHealth>
        ),
    },
    {
      name: 'Actions',
      actions: [
        {
          name: 'Force password change',
          description: 'User must set a new password at next SWORD login',
          icon: 'lockOpen',
          type: 'icon',
          available: (u: ManagedUser) => u.role === 'soc' && !u.mustChangePassword,
          onClick: (u: ManagedUser) => setConfirm({ user: u, action: 'reset' }),
        },
        {
          name: 'Remove SOC role',
          description: `Remove from the ${DEFAULT_SOC_ROLE} role mapping`,
          icon: 'minusInCircle',
          type: 'icon',
          color: 'danger',
          available: (u: ManagedUser) => u.role === 'soc',
          onClick: (u: ManagedUser) => setConfirm({ user: u, action: 'remove' }),
        },
      ],
    },
  ];

  return (
    <>
      {error && (
        <>
          <EuiCallOut color="danger" iconType="alert" title="Unable to load access control">
            {error}
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      <EuiFlexGroup gutterSize="m" wrap>
        <EuiFlexItem style={{ minWidth: 360 }}>
          <Section
            title="Role model"
            icon="lock"
            description="Least privilege, deny by default. Every API call is authorised on the server with the user's own OpenSearch identity."
          >
            <table className="swordMatrix">
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>Master Administrator</th>
                  <th>SOC Team</th>
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row) => (
                  <tr key={row.feature}>
                    <td>
                      {row.feature}
                      {row.note && (
                        <>
                          {' '}
                          <EuiBadge color="hollow">{row.note}</EuiBadge>
                        </>
                      )}
                    </td>
                    <td>{row.admin ? yes : no}</td>
                    <td>{row.soc ? yes : no}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <EuiSpacer size="m" />
            <EuiText size="xs" color="subdued">
              Master Administrator roles:{' '}
              {overview?.adminRoles.map((r) => (
                <code key={r}>{r} </code>
              ))}
              <br />
              SOC Team roles:{' '}
              {overview?.socRoles.map((r) => (
                <code key={r}>{r} </code>
              ))}
              <br />
              Users with none of these roles cannot open SWORD.
            </EuiText>
          </Section>
        </EuiFlexItem>

        <EuiFlexItem style={{ minWidth: 360 }}>
          <Section
            title="OpenSearch security roles"
            icon="securityApp"
            description="SWORD roles are regular OpenSearch security roles, so index access is also enforced by the Wazuh indexer."
            action={
              <EuiButton
                size="s"
                iconType={rolesInstalled ? 'refresh' : 'download'}
                onClick={() => run(api.installRoles, 'SWORD roles installed')}
                isLoading={busy}
                isDisabled={!overview || Boolean(overview.securityApiError)}
              >
                {rolesInstalled ? 'Update roles' : 'Install roles'}
              </EuiButton>
            }
          >
            {[DEFAULT_ADMIN_ROLE, DEFAULT_SOC_ROLE].map((r) => (
              <div key={r} className="swordList__row">
                <code>{r}</code>
                {overview?.installedRoles[r] ? (
                  <EuiHealth color="success">Installed</EuiHealth>
                ) : (
                  <EuiHealth color="warning">Not installed</EuiHealth>
                )}
              </div>
            ))}
            <EuiSpacer size="s" />
            <EuiAccordion id="swordRoleDetails" buttonContent="What do these roles grant?">
              <EuiText size="s">
                <ul>
                  <li>
                    <code>{DEFAULT_SOC_ROLE}</code>: read-only on <code>wazuh-alerts-*</code> with
                    document-level security limited to ML detections and Suricata alerts, read on{' '}
                    <code>wazuh-monitoring-*</code>, read-only dashboards tenant.
                  </li>
                  <li>
                    <code>{DEFAULT_ADMIN_ROLE}</code>: read on the same indices without the DLS
                    filter. The default Wazuh <code>admin</code> user (<code>all_access</code>) is
                    already a Master Administrator.
                  </li>
                </ul>
              </EuiText>
            </EuiAccordion>
            <EuiSpacer size="m" />
            <EuiCallOut size="s" iconType="iInCircle" title="Creating users">
              Create, edit and delete user accounts with Wazuh&apos;s built-in user management (
              <EuiLink href={securityUsersUrl}>
                Indexer management → Security → Internal users
              </EuiLink>
              ), then grant them the SOC role below. New SOC members must change the temporary
              password you gave them the first time they open SWORD.
            </EuiCallOut>
          </Section>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <Section
        title="SWORD users"
        icon="users"
        description="Internal users that hold a SWORD role."
        action={
          <EuiFlexGroup gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiFieldText
                compressed
                placeholder="Existing username"
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                aria-label="Username to add to the SOC team"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                fill
                iconType="plusInCircle"
                isDisabled={!newMember.trim() || !overview?.installedRoles[DEFAULT_SOC_ROLE]}
                isLoading={busy}
                onClick={() =>
                  run(
                    () => api.socMember(newMember.trim(), 'add'),
                    `${newMember.trim()} added to the SOC team`
                  ).then(() => setNewMember(''))
                }
              >
                Add to SOC team
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        }
      >
        {overview?.securityApiError && (
          <>
            <EuiCallOut
              color="warning"
              iconType="alert"
              size="s"
              title="Security API not available to you"
            >
              {overview.securityApiError}. Only users already known to SWORD are listed.
            </EuiCallOut>
            <EuiSpacer size="s" />
          </>
        )}
        {!overview?.enforcePasswordChange && (
          <>
            <EuiCallOut
              color="warning"
              size="s"
              iconType="alert"
              title="First-login password change is disabled"
            >
              Set <code>swordMachineLearning.access.enforcePasswordChange: true</code> in
              opensearch_dashboards.yml to enforce it.
            </EuiCallOut>
            <EuiSpacer size="s" />
          </>
        )}
        <EuiBasicTable<ManagedUser>
          items={overview?.users ?? []}
          columns={columns}
          loading={loading}
        />
      </Section>

      {overview && (
        <>
          <EuiSpacer size="m" />
          <EuiAccordion id="swordYaml" buttonContent="opensearch_dashboards.yml reference">
            <EuiSpacer size="s" />
            <EuiCodeBlock language="yaml" isCopyable fontSize="s">
              {`swordMachineLearning.access.adminRoles: [${overview.adminRoles
                .map((r) => `"${r}"`)
                .join(', ')}]
swordMachineLearning.access.socRoles: [${overview.socRoles.map((r) => `"${r}"`).join(', ')}]
swordMachineLearning.access.enforcePasswordChange: ${overview.enforcePasswordChange}`}
            </EuiCodeBlock>
          </EuiAccordion>
        </>
      )}

      {confirm && (
        <EuiConfirmModal
          title={
            confirm.action === 'reset'
              ? `Force ${confirm.user.username} to change password?`
              : `Remove ${confirm.user.username} from the SOC team?`
          }
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const { user, action } = confirm;
            setConfirm(null);
            run(
              () =>
                action === 'reset'
                  ? api.requirePasswordChange(user.username)
                  : api.socMember(user.username, 'remove'),
              action === 'reset'
                ? `${user.username} must change password at next login`
                : `${user.username} removed from the SOC team`
            );
          }}
          cancelButtonText="Cancel"
          confirmButtonText={confirm.action === 'reset' ? 'Force change' : 'Remove'}
          buttonColor={confirm.action === 'reset' ? 'primary' : 'danger'}
        >
          {confirm.action === 'reset' ? (
            <p>They will be blocked from SWORD until they set a new password.</p>
          ) : (
            <p>
              They lose access to SWORD immediately. Users mapped through backend roles must be
              changed in the Wazuh security settings instead.
            </p>
          )}
        </EuiConfirmModal>
      )}
    </>
  );
};
