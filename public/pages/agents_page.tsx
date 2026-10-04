import React, { useCallback, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  EuiBasicTableColumn,
  EuiButton,
  EuiButtonGroup,
  EuiCallOut,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiInMemoryTable,
  EuiLink,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { AgentSummary } from '../../common';
import { errorText } from '../api';
import { AppContext } from '../app';
import { AgentSetupGuide } from '../components/agent_setup_guide';
import { AttackBadge, KpiCard, Section, formatNumber, fromNow } from '../components/common';

const RANGES = [
  { id: 'now-24h', label: '24h' },
  { id: 'now-7d', label: '7 days' },
  { id: 'now-30d', label: '30 days' },
  { id: 'now-90d', label: '90 days' },
];

const STATUS_COLORS: Record<string, string> = {
  active: 'success',
  disconnected: 'danger',
  pending: 'warning',
  never_connected: 'subdued',
};

export const AgentsPage = ({ ctx }: { ctx: AppContext }) => {
  const { api, core, access } = ctx;
  const history = useHistory();
  const [range, setRange] = useState('now-30d');
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [monitoringAvailable, setMonitoringAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.agents(range, 'now');
      setAgents(res.items);
      setMonitoringAvailable(res.monitoringAvailable);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [api, range]);

  useEffect(() => {
    load();
  }, [load]);

  const wazuhAgentsUrl = core.http.basePath.prepend('/app/endpoints-summary#/agents-preview/');
  const deployUrl = core.http.basePath.prepend('/app/endpoints-summary#/agents-preview/deploy');

  const withDetections = agents.filter((a) => a.detections > 0).length;
  const withSensor = agents.filter((a) => a.detections > 0 || a.suricataAlerts > 0).length;
  const active = agents.filter((a) => a.status === 'active').length;

  const columns: Array<EuiBasicTableColumn<AgentSummary>> = [
    {
      field: 'name',
      name: 'Agent',
      sortable: true,
      render: (name: string, a) => (
        <div>
          <strong>{name}</strong>
          <EuiText size="xs" color="subdued">
            ID {a.id}
            {a.os ? ` · ${a.os}` : ''}
          </EuiText>
        </div>
      ),
    },
    { field: 'ip', name: 'IP address', render: (ip: string) => <code>{ip || '-'}</code> },
    {
      field: 'status',
      name: 'Status',
      sortable: true,
      render: (status?: string) =>
        status ? (
          <EuiHealth color={STATUS_COLORS[status] ?? 'subdued'}>
            {status.replace('_', ' ')}
          </EuiHealth>
        ) : (
          <EuiToolTip content="Wazuh monitoring data is not available for this agent">
            <EuiHealth color="subdued">unknown</EuiHealth>
          </EuiToolTip>
        ),
    },
    {
      name: 'SWORD sensor',
      render: (a: AgentSummary) =>
        a.detections > 0 || a.suricataAlerts > 0 ? (
          <EuiHealth color="success">Reporting</EuiHealth>
        ) : (
          <EuiToolTip content="No Suricata or ML events received in this period">
            <EuiHealth color="warning">No data</EuiHealth>
          </EuiToolTip>
        ),
    },
    {
      field: 'detections',
      name: 'ML detections',
      sortable: true,
      render: (n: number) => <strong>{formatNumber(n)}</strong>,
    },
    {
      field: 'topAttack',
      name: 'Top attack',
      render: (t: string | null) => (t ? <AttackBadge type={t} /> : '-'),
    },
    {
      field: 'suricataAlerts',
      name: 'Suricata alerts',
      sortable: true,
      render: (n: number) => formatNumber(n),
    },
    {
      field: 'lastDetection',
      name: 'Last attack',
      sortable: true,
      render: (v: string | null) => fromNow(v),
    },
    {
      name: '',
      actions: [
        {
          name: 'View attacks',
          description: 'Open Attack Monitor filtered to this agent',
          icon: 'visBarVerticalStacked',
          type: 'icon',
          onClick: (a: AgentSummary) => history.push(`/overview?agent=${encodeURIComponent(a.id)}`),
        },
      ],
    },
  ];

  return (
    <>
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" wrap>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend="Time range"
            options={RANGES}
            idSelected={range}
            onChange={(id) => setRange(id)}
            buttonSize="compressed"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButton iconType="refresh" onClick={load} isLoading={loading} size="s">
                Refresh
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton iconType="documentation" onClick={() => setShowGuide(true)} size="s">
                Connect an agent
              </EuiButton>
            </EuiFlexItem>
            {access.role === 'admin' && (
              <EuiFlexItem grow={false}>
                <EuiButton fill iconType="popout" href={wazuhAgentsUrl} size="s">
                  Manage agents in Wazuh
                </EuiButton>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiFlexGrid columns={4} gutterSize="m">
        <EuiFlexItem>
          <KpiCard
            title="Agents seen"
            value={formatNumber(agents.length)}
            icon="node"
            color="#2b34c7"
            loading={loading && !agents.length}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <KpiCard
            title="Active agents"
            value={monitoringAvailable ? formatNumber(active) : '-'}
            icon="online"
            color="#54B399"
            hint={monitoringAvailable ? 'From Wazuh monitoring' : 'Monitoring data unavailable'}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <KpiCard
            title="SWORD sensors reporting"
            value={formatNumber(withSensor)}
            icon="securityApp"
            color="#6092C0"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <KpiCard
            title="Agents attacked"
            value={formatNumber(withDetections)}
            icon="securitySignalDetected"
            color="#BD271E"
          />
        </EuiFlexItem>
      </EuiFlexGrid>

      <EuiSpacer size="m" />

      {error && (
        <>
          <EuiCallOut title="Unable to load agents" color="danger" iconType="alert">
            {error}
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      <Section
        title="Wazuh agents"
        icon="node"
        description={
          <>
            Attack status of every agent connected to the Wazuh Manager. Adding and removing agents
            is done with the standard Wazuh agent management
            {access.role === 'admin' ? (
              <>
                {' '}
                (<EuiLink href={wazuhAgentsUrl}>open</EuiLink>)
              </>
            ) : null}
            .
          </>
        }
      >
        <EuiInMemoryTable<AgentSummary>
          items={agents}
          columns={columns}
          loading={loading}
          search={{ box: { incremental: true, placeholder: 'Search agents' } }}
          pagination={{ initialPageSize: 20, pageSizeOptions: [10, 20, 50] }}
          sorting={{ sort: { field: 'detections', direction: 'desc' } }}
          message={
            loading ? undefined : (
              <EuiText size="s" color="subdued">
                No agent has sent Suricata or ML events yet.{' '}
                <EuiLink onClick={() => setShowGuide(true)}>See how to connect one</EuiLink>.
              </EuiText>
            )
          }
        />
      </Section>

      {showGuide && <AgentSetupGuide onClose={() => setShowGuide(false)} deployUrl={deployUrl} />}
    </>
  );
};
