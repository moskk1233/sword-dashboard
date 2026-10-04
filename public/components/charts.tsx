import React from 'react';
import moment from 'moment';
import {
  Axis,
  BarSeries,
  Chart,
  Partition,
  PartitionLayout,
  Position,
  ScaleType,
  Settings,
  XYChartSeriesIdentifier,
} from '@elastic/charts';
import { EUI_CHARTS_THEME_DARK, EUI_CHARTS_THEME_LIGHT } from '@elastic/eui/dist/eui_charts_theme';
import { EuiEmptyPrompt, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import { CountBucket, TrendPoint, getAttackFamily } from '../../common';

const chartTheme = (dark: boolean) => (dark ? EUI_CHARTS_THEME_DARK : EUI_CHARTS_THEME_LIGHT).theme;

export const colorForType = (type: string) => getAttackFamily(type).color;

const Empty = ({ height }: { height: number }) => (
  <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <EuiEmptyPrompt
      iconType="cheer"
      titleSize="xs"
      title={<h4>No attacks in this period</h4>}
      body={<p>Machine Learning has not flagged any traffic for the selected filters.</p>}
    />
  </div>
);

interface TrendProps {
  data: TrendPoint[];
  interval: 'hour' | 'day';
  min: number;
  max: number;
  dark: boolean;
  height?: number;
}

export const AttackTrendChart = ({ data, interval, min, max, dark, height = 300 }: TrendProps) => {
  const points = data.filter((d) => d.type);
  if (!points.length) return <Empty height={height} />;
  const step = interval === 'hour' ? 3600000 : 86400000;
  const format = interval === 'hour' ? 'DD MMM HH:mm' : 'DD MMM';
  return (
    <Chart size={{ height }}>
      <Settings
        theme={chartTheme(dark)}
        showLegend
        legendPosition={Position.Bottom}
        xDomain={{ min, max, minInterval: step }}
      />
      <BarSeries
        id="attacks"
        name="Attacks"
        data={points}
        xScaleType={ScaleType.Time}
        yScaleType={ScaleType.Linear}
        xAccessor="time"
        yAccessors={['count']}
        splitSeriesAccessors={['type']}
        stackAccessors={['time']}
        color={(series: XYChartSeriesIdentifier) =>
          colorForType(String(series.splitAccessors.get('type') ?? ''))
        }
      />
      <Axis
        id="time"
        position={Position.Bottom}
        tickFormat={(v) => moment(v).format(format)}
        showGridLines={false}
      />
      <Axis
        id="count"
        position={Position.Left}
        tickFormat={(v) => (Number.isInteger(v) ? String(v) : '')}
        showGridLines
      />
    </Chart>
  );
};

interface DonutProps {
  data: CountBucket[];
  dark: boolean;
  height?: number;
}

export const AttackTypeDonut = ({ data, dark, height = 220 }: DonutProps) => {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) return <Empty height={height} />;
  return (
    <EuiFlexGroup direction="column" gutterSize="m">
      <EuiFlexItem>
        <div className="swordDonut" style={{ height }}>
          <Chart size={{ height }}>
            <Settings theme={chartTheme(dark)} />
            <Partition
              id="types"
              data={data}
              valueAccessor={(d: CountBucket) => d.count}
              layers={[
                {
                  groupByRollup: (d: CountBucket) => d.key,
                  nodeLabel: () => '',
                  shape: { fillColor: (node) => colorForType(String(node.dataName)) },
                },
              ]}
              config={{
                partitionLayout: PartitionLayout.sunburst,
                emptySizeRatio: 0.62,
                linkLabel: { maxCount: 0 },
                outerSizeRatio: 0.9,
              }}
            />
          </Chart>
          <div className="swordDonut__center">
            <div className="swordDonut__total">{total.toLocaleString()}</div>
            <EuiText size="xs" color="subdued">
              detections
            </EuiText>
          </div>
        </div>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
