import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTableColumn,
  EuiButtonIcon,
  EuiCallOut,
  EuiCodeBlock,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiHealth,
  EuiInMemoryTable,
  EuiLoadingSpinner,
  EuiSearchBarProps,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { SuricataAlert } from '../../common';
import { AttackQuery, SwordApi, errorText } from '../api';
import { formatTime } from './common';

/** Suricata alert severity: 1 = most severe … 3 = least. */
const severityView = (s: number | null) => {
  if (s === null) return <EuiText size="xs" color="subdued">-</EuiText>;
  const color = s <= 1 ? 'danger' : s === 2 ? 'warning' : 'subdued';
  const label = s <= 1 ? 'High' : s === 2 ? 'Medium' : 'Low';
  return <EuiHealth color={color}>{`${label} (${s})`}</EuiHealth>;
};

const prettyLog = (log?: string) => {
  if (!log) return '';
  try {
    return JSON.stringify(JSON.parse(log), null, 2);
  } catch {
    return log;
  }
};

interface Props {
  api: SwordApi;
  query: AttackQuery;
  onClose: () => void;
}

export const SuricataAlertsFlyout = ({ api, query, onClose }: Props) => {
  const [items, setItems] = useState<SuricataAlert[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, React.ReactNode>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.suricata({ ...query, from: 0, size: 200 });
      setItems(res.items);
      setTotal(res.total);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [api, query]);

  useEffect(() => {
    load();
  }, [load]);

  // Filters for the built-in search bar: severity + the categories actually present.
  const search: EuiSearchBarProps = useMemo(() => {
    const categories = [...new Set(items.map((i) => i.category).filter(Boolean))].sort();
    return {
      box: { incremental: true, placeholder: 'Search signature / category / IP' },
      filters: [
        {
          type: 'field_value_selection',
          field: 'severity',
          name: 'Severity',
          multiSelect: 'or',
          options: [
            { value: 1, name: 'High (1)' },
            { value: 2, name: 'Medium (2)' },
            { value: 3, name: 'Low (3)' },
          ],
        },
        {
          type: 'field_value_selection',
          field: 'category',
          name: 'Category',
          multiSelect: 'or',
          options: categories.map((c) => ({ value: c, name: c })),
        },
      ],
    };
  }, [items]);

  const toggleExpand = (item: SuricataAlert) =>
    setExpanded((prev) => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = (
          <EuiCodeBlock language="json" paddingSize="s" fontSize="s" isCopyable>
            {prettyLog(item.full_log) || 'No raw log'}
          </EuiCodeBlock>
        );
      }
      return next;
    });

  const columns: Array<EuiBasicTableColumn<SuricataAlert>> = [
    { field: 'timestamp', name: 'Time', width: '155px', render: (v: string) => formatTime(v) },
    { field: 'agent_name', name: 'Agent', width: '120px', truncateText: true },
    {
      field: 'signature',
      name: 'Signature',
      render: (sig: string, item) => (
        <EuiText size="xs">
          <strong>{sig || '-'}</strong>
          {item.category ? (
            <>
              <br />
              <span style={{ opacity: 0.7 }}>{item.category}</span>
            </>
          ) : null}
        </EuiText>
      ),
    },
    { name: 'Severity', width: '110px', render: (item: SuricataAlert) => severityView(item.severity) },
    {
      name: 'Source → Destination',
      render: (item: SuricataAlert) => (
        <EuiText size="xs">
          <code>
            {item.src_ip || '-'}
            {item.src_port ? `:${item.src_port}` : ''}
          </code>{' '}
          →{' '}
          <code>
            {item.dest_ip || '-'}
            {item.dest_port ? `:${item.dest_port}` : ''}
          </code>
          {item.proto ? <EuiBadge color="hollow">{item.proto}</EuiBadge> : null}
        </EuiText>
      ),
    },
    {
      align: 'right',
      width: '40px',
      isExpander: true,
      render: (item: SuricataAlert) => (
        <EuiButtonIcon
          onClick={() => toggleExpand(item)}
          aria-label="Show raw log"
          iconType={expanded[item.id] ? 'arrowUp' : 'arrowDown'}
        />
      ),
    },
  ];

  return (
    <EuiFlyout onClose={onClose} size="l" ownFocus aria-labelledby="swordSuricataFlyout">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="s">
          <h2 id="swordSuricataFlyout">Suricata IDS alerts</h2>
        </EuiTitle>
        <EuiText size="xs" color="subdued">
          Signature-based alerts from Suricata (eve.json). Showing the {items.length} most recent of{' '}
          {total.toLocaleString()} in the selected time range.
        </EuiText>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {error ? (
          <EuiCallOut color="danger" iconType="alert" title="Unable to load Suricata alerts">
            {error}
          </EuiCallOut>
        ) : loading ? (
          <div className="swordCenter">
            <EuiLoadingSpinner size="xl" />
          </div>
        ) : (
          <EuiInMemoryTable<SuricataAlert>
            items={items}
            columns={columns}
            itemId="id"
            itemIdToExpandedRowMap={expanded}
            isExpandable
            tableLayout="auto"
            pagination={{ initialPageSize: 20, pageSizeOptions: [20, 50, 100] }}
            sorting={{ sort: { field: 'timestamp', direction: 'desc' } }}
            search={search}
            message={
              <EuiText size="s" color="subdued">
                No Suricata alerts in this time range
              </EuiText>
            }
          />
        )}
        <EuiSpacer size="m" />
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
