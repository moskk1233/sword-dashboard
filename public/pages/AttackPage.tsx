import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';

import {
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiTitle,
  EuiCallOut,
  EuiFlexGroup,
  EuiButton,
  EuiIcon,
} from '@elastic/eui';

import { CoreStart } from '../../../../src/core/public';
import { NavigationPublicPluginStart } from '../../../../src/plugins/navigation/public';
import { AttackItem, OverviewItem, TrendPoint } from '../../common/types';
import { AttackHistoryTable } from '../components/AttackHistoryTable';
import { AttackOverview } from '../components/AttackOverview';
import { AttackTrendChart } from '../components/AttackTrendChart';
import { FilterBar } from '../components/FilterBar';
import moment from 'moment';

interface SwordMachineLearningAppDeps {
  basename: string;
  notifications: CoreStart['notifications'];
  http: CoreStart['http'];
  navigation: NavigationPublicPluginStart;
}

export const SwordMachineLearningApp = ({
  basename,
  notifications,
  http,
  navigation,
}: SwordMachineLearningAppDeps) => {
  // Filter state
  const [startDate, setStartDate] = useState(() => moment().subtract(7, 'day'));
  const [endDate, setEndDate] = useState(() => moment());
  const [lastUpdatedAt, setLastUpatedAt] = useState(() => moment().format("DD MMM YYYY - HH:mm:ss"));

  // Pagination state
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Data state
  const [tableItems, setTableItems] = useState<AttackItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [topAttack, setTopAttack] = useState('-');
  const [totalDetected, setTotalDetected] = useState(0);
  const [overview, setOverview] = useState<OverviewItem[]>([]);

  // Loading & error state
  const [loadingTable, setLoadingTable] = useState(false);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTrend = async () => {
    setLoadingTrend(true);
    setError(null);
    try {
      const result = await http.get('/api/sword_machine_learning/trend', {
        query: { 
          start: startDate.toISOString(), 
          end: endDate.toISOString() 
        },
      });
      setTrendData(result.trend.map((item: TrendPoint) => ({
        ...item,
        date: moment(item.date).format("DD MMM YYYY")
      })));
      setTopAttack(result.topAttack);
      setTotalDetected(result.totalDetected);
      setOverview(result.overview);
    } catch {
      setError('Unable fetch attack trend.');
    } finally {
      setLoadingTrend(false);
    }
  };

  const fetchAttacks = async () => {
    setLoadingTable(true);
    setError(null);
    try {
      const result = await http.get('/api/sword_machine_learning/attacks', {
        query: {
          from: pageIndex * pageSize,
          size: pageSize,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      });
      setTableItems(result.items);
      setTotalItems(result.total);
    } catch {
      setError('Unable fetch attack data');
    } finally {
      setLoadingTable(false);
    }
  };

  const onFilter = () => {
    setPageIndex(0);
    fetchTrend();
    fetchAttacks();
  };

  const onTableChange = ({ page }: { page: { index: number; size: number } }) => {
    setPageIndex(page.index);
    setPageSize(page.size)
  };

  const onRefreshClick = () => {
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);

    fetchTrend();
    fetchAttacks();
    setLastUpatedAt(moment().format("DD MMM YYYY - HH:mm:ss"));

    refreshIntervalRef.current = setInterval(() => {
      fetchTrend();
      fetchAttacks();
      setLastUpatedAt(() => moment().format("DD MMM YYYY - HH:mm:ss"));
    }, 5000);
  }

  useEffect(() => {
    fetchTrend();
    fetchAttacks();

    refreshIntervalRef.current = setInterval(() => {
      fetchTrend();
      fetchAttacks();
      setLastUpatedAt(() => moment().format("DD MMM YYYY - HH:mm:ss"));
    }, 5000);

    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    }
  }, []);

  useEffect(() => {
    fetchAttacks();
  }, [pageIndex, pageSize]);

  return (
    <Router basename={basename}>
      <EuiPage paddingSize="m">
        <EuiPageBody component="section">

          {error && (
            <>
              <EuiCallOut title={error} color="danger" iconType="alert" />
              <EuiSpacer size="m" />
            </>
          )}

          {/* Filter */}
          <FilterBar
            startDate={startDate}
            endDate={endDate}
            lastUpdatedAtText={lastUpdatedAt}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onFilter={onFilter}
          />

          <EuiSpacer size="l" />

          {/* Trend */}
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" style={{ padding: "20px 10px" }}>
            <EuiTitle size="s"><h3>Attack Trend</h3></EuiTitle>
            <EuiButton onClick={onRefreshClick}>
              <EuiIcon type="refresh" />
              Refresh
            </EuiButton>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
          <AttackTrendChart
            trendData={trendData}
            topAttack={topAttack}
            totalDetected={totalDetected}
            loading={loadingTrend}
          />

          <EuiSpacer size="l" />

          {/* Overview */}
          <EuiTitle size="s"><h3>Attack Overview</h3></EuiTitle>
          <EuiSpacer size="s" />
          <AttackOverview overview={overview} />

          <EuiSpacer size="l" />

          {/* History */}
          <EuiTitle size="s"><h3>Attack History</h3></EuiTitle>
          <EuiSpacer size="s" />
          <AttackHistoryTable
            items={tableItems}
            totalItems={totalItems}
            pageIndex={pageIndex}
            pageSize={pageSize}
            loading={loadingTable}
            onChange={onTableChange}
          />

        </EuiPageBody>
      </EuiPage>
    </Router>
  );
};
