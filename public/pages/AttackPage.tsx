import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';

import {
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiTitle,
  EuiCallOut,
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
  const [startDate, setStartDate] = useState(moment().subtract(7, 'day'));
  const [endDate, setEndDate] = useState(moment());

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

  useEffect(() => {
    fetchTrend();
    fetchAttacks();
  }, []);

  useEffect(() => {
    fetchAttacks();
  }, [pageIndex, pageSize]);

  const onFilter = () => {
    setPageIndex(0);
    fetchTrend();
    fetchAttacks();
  };

  const onTableChange = ({ page }: { page: { index: number; size: number } }) => {
    setPageIndex(page.index);
    setPageSize(page.size)
  };

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
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onFilter={onFilter}
          />

          <EuiSpacer size="l" />

          {/* Trend */}
          <EuiTitle size="s"><h3>Attack Trend (Last 7 Days)</h3></EuiTitle>
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
