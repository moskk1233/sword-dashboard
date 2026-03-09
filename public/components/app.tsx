import React, { useState } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';

import {
  EuiPage,
  EuiPageBody,
  EuiFlexGroup,
  EuiFlexItem,
  EuiStat,
  EuiPanel,
  EuiDatePickerRange,
  EuiButton,
  EuiSpacer,
  EuiTitle,
  EuiBasicTable,
  EuiText,
} from '@elastic/eui';
import { Chart, Settings, Axis, BarSeries } from '@elastic/charts';

import { CoreStart } from '../../../../src/core/public';
import { NavigationPublicPluginStart } from '../../../../src/plugins/navigation/public';

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
  const [startDate, setStartDate] = useState(new Date('2024-06-25T22:00:00'));
  const [endDate, setEndDate] = useState(new Date('2024-06-30T09:00:00'));
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 5;

  // 2. ข้อมูลจำลองสำหรับกราฟ (Attack Trend)
  const chartData = [
    { x: 'Nov 1', y: 33.3 },
    { x: 'Nov 2', y: 33.6 },
    { x: 'Nor 2', y: 398 }, // ตามตัวสะกดในภาพ
    { x: 'Nev 4', y: 333 },
    { x: 'Nev 7', y: 396 },
    { x: 'Nor 3', y: 4877 },
    { x: 'Nev 6', y: 3378 },
    { x: 'Nev 7 ', y: 7.82 },
  ];

  // 3. ข้อมูลจำลองสำหรับตาราง (Attack History)
  const tableItems = [
    { timestamp: '25/09/2024 10:59 PM', agent: 'Ubuntu Server', type: 'Brute Force' },
    { timestamp: '25/09/2024 10:59 PM', agent: 'Ubuntu Server', type: 'Brute Force' },
    { timestamp: '25/09/2024 10:59 PM', agent: 'Ubuntu Server', type: 'Brute Force' },
  ];

  const columns = [
    { field: 'timestamp', name: 'Timestamp', sortable: true },
    { field: 'agent', name: 'Agent Name', sortable: true },
    { field: 'type', name: 'Attack Type', sortable: true },
  ];

  const onTableChange = ({ page }: { page: { index: number; size: number } }) => {
    setPageIndex(page.index);
  };

  const pageItems = tableItems.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  // Render the application DOM.
  // Note that `navigation.ui.TopNavMenu` is a stateful component exported on the `navigation` plugin's start contract.
  return (
    <Router basename={basename}>
      <>
        <EuiPage paddingSize="m">
          <EuiPageBody component="section">
            {/* Filter Section */}
            <EuiPanel color="subdued" style={{ backgroundColor: '#2b34c7', marginTop: '10px' }}>
              <EuiFlexGroup alignItems="center">
                <EuiFlexItem grow={false}>
                  <EuiText color="ghost"><strong>Filter by Date and Time</strong></EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiDatePickerRange
                    startDateControl={
                      <input type="datetime-local" className="euiFieldText" />
                    }
                    endDateControl={
                      <input type="datetime-local" className="euiFieldText" />
                    }
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton fill color="secondary">Filter</EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>

            <EuiSpacer size="l" />

            {/* Attack Trend & Stats */}
            <EuiTitle size="s"><h3>Attack Trend (Last 7 Days)</h3></EuiTitle>
            <EuiFlexGroup>
              <EuiFlexItem grow={3}>
                <EuiPanel style={{ height: '300px' }}>
                  <Chart>
                    <Settings showLegend={false} />
                    <BarSeries
                      id="trends"
                      name="Attacks"
                      data={chartData}
                      xAccessor="x"
                      yAccessors={['y']}
                    />
                    <Axis id="bottom-axis" position="bottom" />
                    <Axis id="left-axis" position="left" />
                  </Chart>
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem grow={1}>
                <EuiPanel color="primary" hasShadow={false} style={{ backgroundColor: '#2b34c7', color: 'white' }}>
                  <EuiStat title="DDoS" description="Most Popular Attack" titleColor="ghost" />
                </EuiPanel>
                <EuiSpacer size="m" />
                <EuiPanel color="subdued" style={{ backgroundColor: '#3d3d3d', color: 'white' }}>
                  <EuiStat title="200" description="Total Detected" titleColor='ghost' />
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="l" />

            {/* Attack Overview */}
            <EuiTitle size="s"><h3>Attack Overview</h3></EuiTitle>
            <EuiFlexGroup>
              {['DoS: 200', 'Port Scanning: 90'].map((val) => (
                <EuiFlexItem key={val}>
                  <EuiPanel style={{ backgroundColor: '#3d3d3d', textAlign: 'center' }}>
                    <EuiText color="ghost"><strong>{val}</strong></EuiText>
                  </EuiPanel>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>

            <EuiSpacer size="l" />

            {/* Attack History Table */}
            <EuiTitle size="s"><h3>Attack History</h3></EuiTitle>
            <EuiPanel paddingSize="none">
              <EuiBasicTable
                items={pageItems}
                columns={columns}
                pagination={{
                  pageIndex,
                  pageSize,
                  totalItemCount: tableItems.length,
                }}
                onChange={onTableChange}
              />
            </EuiPanel>

          </EuiPageBody>
        </EuiPage>
      </>
    </Router>
  );
};
