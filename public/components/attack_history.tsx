import React, { useState } from 'react';
import {
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiButtonIcon,
  EuiCodeBlock,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLink,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { AttackItem } from '../../common';
import { AttackBadge, ConfidenceMeter, SeverityHealth, formatTime } from './common';

export interface HistorySort {
  field: string;
  direction: 'asc' | 'desc';
}

interface Props {
  items: AttackItem[];
  total: number;
  loading: boolean;
  pageIndex: number;
  pageSize: number;
  sort: HistorySort;
  onChange: (page: { index: number; size: number }, sort: HistorySort) => void;
  onFilterAgent: (id: string) => void;
  onFilterIp: (ip: string) => void;
}

const MODELS: Array<{ key: 'dtConfidence' | 'rfConfidence' | 'xgbConfidence'; label: string }> = [
  { key: 'dtConfidence', label: 'Decision Tree' },
  { key: 'rfConfidence', label: 'Random Forest' },
  { key: 'xgbConfidence', label: 'XGBoost' },
];

// Per-model probabilities, shown only when the detector reports them in ml_log.json.
const modelRows = (item: AttackItem) =>
  MODELS.filter((m) => item[m.key] !== null).map((m) => ({
    title: m.label,
    description: <ConfidenceMeter value={item[m.key]} />,
  }));

const prettyLog = (log?: string) => {
  if (!log) return '';
  try {
    return JSON.stringify(JSON.parse(log), null, 2);
  } catch {
    return log;
  }
};

const AttackFlyout = ({ item, onClose }: { item: AttackItem; onClose: () => void }) => (
  <EuiFlyout onClose={onClose} size="m" ownFocus aria-labelledby="swordAttackFlyout">
    <EuiFlyoutHeader hasBorder>
      <EuiTitle size="s">
        <h2 id="swordAttackFlyout">Attack details</h2>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <AttackBadge type={item.predicted_attack} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <SeverityHealth confidence={item.confidence} />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlyoutHeader>
    <EuiFlyoutBody>
      <EuiDescriptionList
        type="column"
        compressed
        listItems={[
          { title: 'Detected at', description: formatTime(item.timestamp) },
          { title: 'Agent', description: `${item.agent_name} (ID ${item.agent_id})` },
          { title: 'Agent IP', description: item.agent_ip || '-' },
          { title: 'Attacker (source IP)', description: item.src_ip || '-' },
          {
            title: 'Victim (destination)',
            description: `${item.dest_ip || '-'} : ${item.dest_port || '-'}`,
          },
          {
            title: 'Ensemble (soft vote)',
            description: <ConfidenceMeter value={item.confidence} />,
          },
          ...modelRows(item),
          { title: 'Wazuh rule', description: `${item.rule_id} (level ${item.rule_level ?? '-'})` },
          { title: 'Description', description: item.rule_description || '-' },
          { title: 'Log location', description: item.location || '-' },
          { title: 'Index', description: item.index },
        ]}
      />
      {item.full_log && (
        <>
          <EuiSpacer />
          <EuiTitle size="xxs">
            <h4>Raw log from agent</h4>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiCodeBlock language="json" isCopyable paddingSize="m" fontSize="s">
            {prettyLog(item.full_log)}
          </EuiCodeBlock>
        </>
      )}
    </EuiFlyoutBody>
  </EuiFlyout>
);

export const AttackHistoryTable = ({
  items,
  total,
  loading,
  pageIndex,
  pageSize,
  sort,
  onChange,
  onFilterAgent,
  onFilterIp,
}: Props) => {
  const [selected, setSelected] = useState<AttackItem | null>(null);

  const columns: Array<EuiBasicTableColumn<AttackItem>> = [
    {
      field: 'timestamp',
      name: 'Date / Time',
      sortable: true,
      width: '170px',
      render: (v: string) => formatTime(v),
    },
    {
      field: 'agent_name',
      name: 'Agent',
      sortable: true,
      render: (name: string, item) => (
        <EuiLink onClick={() => onFilterAgent(item.agent_id)} title="Filter by this agent">
          {name || item.agent_id}
        </EuiLink>
      ),
    },
    {
      field: 'predicted_attack',
      name: 'Attack type',
      sortable: true,
      render: (type: string) => <AttackBadge type={type} />,
    },
    {
      name: 'Severity',
      width: '100px',
      render: (item: AttackItem) => <SeverityHealth confidence={item.confidence} />,
    },
    {
      field: 'confidence',
      name: 'Confidence',
      sortable: true,
      width: '140px',
      render: (c: number | null) => <ConfidenceMeter value={c} />,
    },
    {
      field: 'src_ip',
      name: 'Source IP',
      sortable: true,
      render: (ip: string) =>
        ip ? (
          <EuiLink onClick={() => onFilterIp(ip)} title="Filter by this IP">
            <code>{ip}</code>
          </EuiLink>
        ) : (
          '-'
        ),
    },
    {
      field: 'dest_ip',
      name: 'Destination',
      render: (ip: string, item) => (
        <code>
          {ip || '-'}
          {item.dest_port ? `:${item.dest_port}` : ''}
        </code>
      ),
    },
    {
      name: '',
      width: '40px',
      render: (item: AttackItem) => (
        <EuiButtonIcon
          iconType="inspect"
          aria-label="View details"
          onClick={() => setSelected(item)}
        />
      ),
    },
  ];

  return (
    <>
      <EuiBasicTable<AttackItem>
        items={items}
        columns={columns}
        loading={loading}
        tableLayout="auto"
        rowProps={(item) => ({ onDoubleClick: () => setSelected(item) })}
        noItemsMessage={
          <EuiText size="s" color="subdued">
            No attacks match the current filters
          </EuiText>
        }
        pagination={{
          pageIndex,
          pageSize,
          totalItemCount: Math.min(total, 10000),
          pageSizeOptions: [10, 20, 50, 100],
        }}
        sorting={{ sort: { field: sort.field as keyof AttackItem, direction: sort.direction } }}
        onChange={({
          page,
          sort: s,
        }: {
          page?: { index: number; size: number };
          sort?: { field: keyof AttackItem; direction: 'asc' | 'desc' };
        }) =>
          onChange(
            { index: page?.index ?? 0, size: page?.size ?? pageSize },
            s ? { field: String(s.field), direction: s.direction } : sort
          )
        }
      />
      {selected && <AttackFlyout item={selected} onClose={() => setSelected(null)} />}
    </>
  );
};
