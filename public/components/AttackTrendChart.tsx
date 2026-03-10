import { Chart, Settings, BarSeries, Axis } from "@elastic/charts";
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiPanel, EuiStat } from "@elastic/eui";
import { TrendPoint } from "../../common/types";
import React from "react";

interface Props {
    trendData: TrendPoint[];
    topAttack: string;
    totalDetected: number;
    loading: boolean;
}

export const AttackTrendChart = ({
    loading,
    topAttack,
    totalDetected,
    trendData
}: Props) => {
    return (
        <EuiFlexGroup>
            {/* Bar Chart */}
            <EuiFlexItem grow={3}>
                <EuiPanel style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {loading ? (
                        <EuiLoadingSpinner size="xl" />
                    ) : (
                        <Chart size={{ height: 250 }}>
                            <Settings showLegend={false} />
                            <BarSeries
                                id="trends"
                                name="Attacks"
                                data={trendData}
                                xAccessor="date"
                                yAccessors={['count']}
                            />
                            <Axis id="bottom-axis" position="bottom" />
                            <Axis id="left-axis" position="left" />
                        </Chart>
                    )}
                </EuiPanel>
            </EuiFlexItem>

            {/* Stat Cards */}
            <EuiFlexItem grow={1}>
                <EuiPanel hasShadow={false} style={{ backgroundColor: '#2b34c7' }}>
                    <EuiStat
                        title={<span style={{ color: '#fff' }}>{topAttack}</span>}
                        description={<span style={{ color: '#aac4ff' }}>Most Popular Attack</span>}
                    />
                </EuiPanel>
                <EuiPanel style={{ backgroundColor: '#3d3d3d', marginTop: '16px' }}>
                    <EuiStat
                        title={<span style={{ color: '#fff' }}>{totalDetected}</span>}
                        description={<span style={{ color: '#aaa' }}>Total Detected</span>}
                    />
                </EuiPanel>
            </EuiFlexItem>
        </EuiFlexGroup>
    );
}