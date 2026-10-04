import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import dateMath from '@elastic/datemath';
import moment from 'moment';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiCallOut,
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFieldSearch,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiSuperDatePicker,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { AttackItem, SummaryResponse, getAttackFamily } from '../../common';
import { AttackQuery, errorText } from '../api';
import { AppContext } from '../app';
import { AttackHistoryTable, HistorySort } from '../components/attack_history';
import { AttackTrendChart, AttackTypeDonut, colorForType } from '../components/charts';
import { SuricataAlertsFlyout } from '../components/suricata_alerts';
import {
  AttackBadge,
  KpiCard,
  Section,
  formatNumber,
  formatTime,
  fromNow,
} from '../components/common';

interface TimeState {
  start: string;
  end: string;
}

const resolveRange = ({ start, end }: TimeState) => {
  const s = dateMath.parse(start) ?? moment().subtract(7, 'days');
  const e = dateMath.parse(end, { roundUp: true }) ?? moment();
  return { start: s.toISOString(), end: e.toISOString(), min: s.valueOf(), max: e.valueOf() };
};

const browserTimeZone = (tz: string) =>
  !tz || tz === 'Browser' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : tz;

export const OverviewPage = ({ ctx }: { ctx: AppContext }) => {
  const { api, core, ui, darkMode } = ctx;
  const location = useLocation();
  const initialAgent = new URLSearchParams(location.search).get('agent');

  // Filters
  const [time, setTime] = useState<TimeState>({ start: 'now-7d', end: 'now' });
  const [isPaused, setIsPaused] = useState(false);
  const [refreshMs, setRefreshMs] = useState(ui.refreshSeconds * 1000);
  const [agents, setAgents] = useState<Array<EuiComboBoxOptionOption<string>>>(
    initialAgent ? [{ label: initialAgent, value: initialAgent }] : []
  );
  const [types, setTypes] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [ipInput, setIpInput] = useState('');
  const [ip, setIp] = useState('');

  // Options for the filter dropdowns
  const [agentOptions, setAgentOptions] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [typeOptions, setTypeOptions] = useState<string[]>([]);

  // Data
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [range, setRange] = useState(() => resolveRange(time));
  const [items, setItems] = useState<AttackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTable, setLoadingTable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // Table
  const [page, setPage] = useState({ index: 0, size: 20 });
  const [sort, setSort] = useState<HistorySort>({ field: 'timestamp', direction: 'desc' });

  // Suricata alerts drill-down
  const [showSuricata, setShowSuricata] = useState(false);

  const query = useMemo((): Omit<AttackQuery, 'start' | 'end'> => {
    return {
      agents: agents.map((a) => a.value!).filter(Boolean),
      types: types.map((t) => t.label),
      ip: ip || undefined,
    };
  }, [agents, types, ip]);

  const tz = browserTimeZone(core.uiSettings.get('dateFormat:tz'));
  const requestId = useRef(0);

  const load = useCallback(
    async (withSummary = true) => {
      const id = ++requestId.current;
      const r = resolveRange(time);
      const interval = r.max - r.min <= 2 * 86400000 ? 'hour' : 'day';
      setError(null);
      if (withSummary) setLoadingSummary(true);
      setLoadingTable(true);
      try {
        const [s, list] = await Promise.all([
          withSummary
            ? api.summary({ ...query, start: r.start, end: r.end, interval, timeZone: tz })
            : Promise.resolve(null),
          api.attacks({
            ...query,
            start: r.start,
            end: r.end,
            from: page.index * page.size,
            size: page.size,
            sortField: sort.field,
            sortDirection: sort.direction,
          }),
        ]);
        if (id !== requestId.current) return;
        if (s) {
          setSummary(s);
          setRange(r);
          setTypeOptions((prev) => [...new Set([...prev, ...s.byType.map((b) => b.key)])].sort());
        }
        setItems(list.items);
        setTotal(list.total);
        setUpdatedAt(new Date().toISOString());
      } catch (e) {
        if (id === requestId.current) setError(errorText(e));
      } finally {
        if (id === requestId.current) {
          setLoadingSummary(false);
          setLoadingTable(false);
        }
      }
    },
    [api, time, query, page, sort, tz]
  );

  // Summary + table reload when filters change; table only when paging/sorting.
  const filtersKey = JSON.stringify([time, query]);
  const lastFiltersKey = useRef<string | null>(null);
  useEffect(() => {
    const filtersChanged = lastFiltersKey.current !== filtersKey;
    lastFiltersKey.current = filtersKey;
    load(filtersChanged);
  }, [load, filtersKey]);

  useEffect(() => {
    if (isPaused || refreshMs <= 0) return;
    const timer = setInterval(() => load(true), refreshMs);
    return () => clearInterval(timer);
  }, [isPaused, refreshMs, load]);

  useEffect(() => {
    api
      .agents('now-90d', 'now')
      .then((res) => {
        const options = res.items.map((a) => ({ label: `${a.name} (${a.id})`, value: a.id }));
        setAgentOptions(options);
        // Show a friendly label for an agent pre-selected through the URL.
        setAgents((current) => current.map((c) => options.find((o) => o.value === c.value) ?? c));
      })
      .catch(() => undefined);
  }, [api]);

  const resetPage = () => setPage((p) => ({ ...p, index: 0 }));

  const filterAgent = (agentId: string) => {
    const option = agentOptions.find((o) => o.value === agentId) ?? {
      label: agentId,
      value: agentId,
    };
    setAgents([option]);
    resetPage();
  };
  const filterIp = (value: string) => {
    setIpInput(value);
    setIp(value);
    resetPage();
  };
  const toggleType = (type: string) => {
    setTypes((current) =>
      current.some((t) => t.label === type)
        ? current.filter((t) => t.label !== type)
        : [...current, { label: type }]
    );
    resetPage();
  };

  const hasFilters = agents.length > 0 || types.length > 0 || Boolean(ip);
  const top = summary?.topAttack;
  const totalByType = summary?.byType.reduce((s, b) => s + b.count, 0) ?? 0;

  return (
    <>
      {/* Filters */}
      <EuiPanel className="swordFilterBar" paddingSize="m">
        <EuiFlexGroup gutterSize="m" alignItems="center" wrap>
          <EuiFlexItem grow={3} style={{ minWidth: 380 }}>
            <EuiSuperDatePicker
              start={time.start}
              end={time.end}
              isPaused={isPaused}
              refreshInterval={refreshMs}
              onTimeChange={({ start, end }) => {
                setTime({ start, end });
                resetPage();
              }}
              onRefreshChange={({ isPaused: p, refreshInterval }) => {
                setIsPaused(p);
                setRefreshMs(refreshInterval);
              }}
              onRefresh={() => load(true)}
              commonlyUsedRanges={[
                { start: 'now/d', end: 'now/d', label: 'Today' },
                { start: 'now-24h', end: 'now', label: 'Last 24 hours' },
                { start: 'now-7d', end: 'now', label: 'Last 7 days' },
                { start: 'now-30d', end: 'now', label: 'Last 30 days' },
                { start: 'now/M', end: 'now/M', label: 'This month' },
                { start: 'now/y', end: 'now/y', label: 'This year' },
              ]}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={2} style={{ minWidth: 220 }}>
            <EuiComboBox
              placeholder="All agents"
              prepend="Agent"
              options={agentOptions}
              selectedOptions={agents}
              onChange={(o) => {
                setAgents(o);
                resetPage();
              }}
              isClearable
              compressed={false}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={2} style={{ minWidth: 220 }}>
            <EuiComboBox
              placeholder="All attack types"
              prepend="Attack"
              options={typeOptions.map((t) => ({ label: t, color: colorForType(t) }))}
              selectedOptions={types}
              onChange={(o) => {
                setTypes(o);
                resetPage();
              }}
              renderOption={(o) => <EuiHealth color={colorForType(o.label)}>{o.label}</EuiHealth>}
              isClearable
            />
          </EuiFlexItem>
          <EuiFlexItem grow={1} style={{ minWidth: 180 }}>
            <EuiFieldSearch
              placeholder="Source / destination IP"
              value={ipInput}
              onChange={(e) => {
                setIpInput(e.target.value);
                if (!e.target.value) filterIp('');
              }}
              onSearch={(v) => filterIp(v.trim())}
              isClearable
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiFlexGroup
          gutterSize="s"
          alignItems="center"
          justifyContent="spaceBetween"
          responsive={false}
        >
          <EuiFlexItem grow={false}>
            {hasFilters && (
              <EuiButtonEmpty
                size="xs"
                iconType="cross"
                onClick={() => {
                  setAgents([]);
                  setTypes([]);
                  filterIp('');
                }}
              >
                Clear filters
              </EuiButtonEmpty>
            )}
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              <EuiIcon type="clock" size="s" /> Updated{' '}
              {updatedAt ? formatTime(updatedAt, 'HH:mm:ss') : '-'}
              {' · '}
              {formatTime(range.min, 'DD MMM YYYY HH:mm')} →{' '}
              {formatTime(range.max, 'DD MMM YYYY HH:mm')}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      {error && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut title="Unable to load attack data" color="danger" iconType="alert">
            {error}
          </EuiCallOut>
        </>
      )}

      <EuiSpacer size="m" />

      {/* KPIs */}
      <EuiFlexGrid columns={4} gutterSize="m" responsive>
        <EuiFlexItem>
          <KpiCard
            title="Total attacks detected"
            value={formatNumber(summary?.total ?? 0)}
            icon="securitySignalDetected"
            color="#BD271E"
            hint="Analysed by Machine Learning"
            loading={loadingSummary && !summary}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <KpiCard
            title="Most popular attack"
            value={
              top ? <span style={{ color: getAttackFamily(top.key).color }}>{top.key}</span> : '-'
            }
            icon={top ? getAttackFamily(top.key).icon : 'alert'}
            color={top ? getAttackFamily(top.key).color : '#6092C0'}
            hint={
              top && totalByType
                ? `${formatNumber(top.count)} times · ${Math.round(
                    (top.count / totalByType) * 100
                  )}%`
                : 'No attacks'
            }
            loading={loadingSummary && !summary}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <KpiCard
            title="Agents under attack"
            value={formatNumber(summary?.agentsAffected ?? 0)}
            icon="node"
            color="#2b34c7"
            hint={`${formatNumber(summary?.uniqueAttackers ?? 0)} unique attacker IPs`}
            loading={loadingSummary && !summary}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <KpiCard
            title="Suricata IDS alerts"
            value={formatNumber(summary?.suricataAlerts ?? 0)}
            icon="securityApp"
            color="#54B399"
            hint="Signature-based alerts · click to view"
            loading={loadingSummary && !summary}
            onClick={() => setShowSuricata(true)}
          />
        </EuiFlexItem>
      </EuiFlexGrid>

      <EuiSpacer size="m" />

      {/* Trend + breakdown */}
      <EuiFlexGroup gutterSize="m" wrap>
        <EuiFlexItem grow={3} style={{ minWidth: 420 }}>
          <Section
            title={summary?.interval === 'hour' ? 'Attack trend (hourly)' : 'Attack trend (daily)'}
            icon="visBarVerticalStacked"
            description="Number of attacks per period, stacked by attack type"
          >
            <AttackTrendChart
              data={summary?.trend ?? []}
              interval={summary?.interval ?? 'day'}
              min={range.min}
              max={range.max}
              dark={darkMode}
            />
          </Section>
        </EuiFlexItem>
        <EuiFlexItem grow={2} style={{ minWidth: 300 }}>
          <Section title="Attacks by type" icon="visPie" description="Click a type to filter">
            <AttackTypeDonut data={summary?.byType ?? []} dark={darkMode} height={200} />
            <EuiSpacer size="s" />
            <div className="swordTypeList">
              {(summary?.byType ?? []).map((b) => {
                const pct = totalByType ? (b.count / totalByType) * 100 : 0;
                const active = types.some((t) => t.label === b.key);
                return (
                  <button
                    type="button"
                    key={b.key}
                    className={`swordTypeList__row ${active ? 'isActive' : ''}`}
                    onClick={() => toggleType(b.key)}
                  >
                    <span
                      className="swordTypeList__dot"
                      style={{ background: colorForType(b.key) }}
                    />
                    <span className="swordTypeList__label">{b.key}</span>
                    <span className="swordTypeList__bar">
                      <span style={{ width: `${pct}%`, background: colorForType(b.key) }} />
                    </span>
                    <span className="swordTypeList__count">{formatNumber(b.count)}</span>
                    <span className="swordTypeList__pct">{pct.toFixed(0)}%</span>
                  </button>
                );
              })}
            </div>
          </Section>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Insights */}
      <EuiFlexGrid columns={3} gutterSize="m">
        <EuiFlexItem>
          <Section title="Most popular attack per day" icon="calendar">
            {summary?.dailyTop.length ? (
              <div className="swordList">
                {[...summary.dailyTop]
                  .reverse()
                  .slice(0, 7)
                  .map((d) => (
                    <div className="swordList__row" key={d.time}>
                      <span className="swordList__date">{moment(d.time).format('ddd DD MMM')}</span>
                      <AttackBadge type={d.type} />
                      <EuiToolTip content={`${d.count} of ${d.total} attacks that day`}>
                        <span className="swordList__count">
                          {formatNumber(d.count)}
                          <span className="swordList__muted"> / {formatNumber(d.total)}</span>
                        </span>
                      </EuiToolTip>
                    </div>
                  ))}
              </div>
            ) : (
              <EuiText size="s" color="subdued">
                No data
              </EuiText>
            )}
          </Section>
        </EuiFlexItem>
        <EuiFlexItem>
          <Section title="Top attacker IPs" icon="crosshairs">
            {summary?.topAttackers.length ? (
              <div className="swordList">
                {summary.topAttackers.map((a) => (
                  <div className="swordList__row" key={a.key}>
                    <EuiLink onClick={() => filterIp(a.key)}>
                      <code>{a.key}</code>
                    </EuiLink>
                    <span className="swordList__muted">{fromNow(a.lastSeen)}</span>
                    <EuiBadge color="danger">{formatNumber(a.count)}</EuiBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EuiText size="s" color="subdued">
                No data
              </EuiText>
            )}
          </Section>
        </EuiFlexItem>
        <EuiFlexItem>
          <Section title="Most targeted agents" icon="node">
            {summary?.topAgents.length ? (
              <div className="swordList">
                {summary.topAgents.map((a) => (
                  <div className="swordList__row" key={a.key}>
                    <EuiLink onClick={() => filterAgent(a.key)}>{a.name}</EuiLink>
                    <span className="swordList__muted">ID {a.key}</span>
                    <EuiBadge color="primary">{formatNumber(a.count)}</EuiBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EuiText size="s" color="subdued">
                No data
              </EuiText>
            )}
            {summary && summary.topSignatures.length > 0 && (
              <>
                <EuiSpacer size="m" />
                <EuiText size="xs" color="subdued">
                  <strong>Top Suricata signatures</strong>
                </EuiText>
                <div className="swordList">
                  {summary.topSignatures.map((s) => (
                    <div className="swordList__row" key={s.key}>
                      <span className="swordList__sig" title={s.key}>
                        {s.key}
                      </span>
                      <EuiBadge color="hollow">{formatNumber(s.count)}</EuiBadge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>
        </EuiFlexItem>
      </EuiFlexGrid>

      <EuiSpacer size="m" />

      {/* History */}
      <Section
        title="Attack history"
        icon="list"
        description="Every attack analysed by Machine Learning, with the date and the agent that was attacked"
        action={<EuiBadge color="hollow">{formatNumber(total)} records</EuiBadge>}
      >
        <AttackHistoryTable
          items={items}
          total={total}
          loading={loadingTable}
          pageIndex={page.index}
          pageSize={page.size}
          sort={sort}
          onChange={(p, s) => {
            setPage(p);
            setSort(s);
          }}
          onFilterAgent={filterAgent}
          onFilterIp={filterIp}
        />
      </Section>

      {showSuricata && (
        <SuricataAlertsFlyout
          api={api}
          query={{ start: range.start, end: range.end, agents: query.agents, ip: query.ip }}
          onClose={() => setShowSuricata(false)}
        />
      )}
    </>
  );
};
