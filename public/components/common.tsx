import React from 'react';
import moment from 'moment';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiLoadingContent,
  EuiPanel,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { SEVERITY_COLORS, SwordRole, getAttackFamily, getSeverity } from '../../common';

export const formatTime = (
  value: string | number | null | undefined,
  format = 'DD MMM YYYY HH:mm:ss'
) => (value ? moment(value).format(format) : '-');

export const fromNow = (value: string | null | undefined) =>
  value ? moment(value).fromNow() : '-';

export const formatNumber = (n: number) => n.toLocaleString();

export const AttackBadge = ({ type }: { type: string }) => {
  const family = getAttackFamily(type);
  return (
    <EuiToolTip content={family.description}>
      <EuiBadge color={family.color} iconType={family.icon} className="swordAttackBadge">
        {type || '-'}
      </EuiBadge>
    </EuiToolTip>
  );
};

export const SeverityHealth = ({ confidence }: { confidence: number | null }) => {
  const severity = getSeverity(confidence);
  return (
    <EuiHealth color={SEVERITY_COLORS[severity]} className="swordSeverity">
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </EuiHealth>
  );
};

export const ConfidenceMeter = ({ value }: { value: number | null }) => {
  if (value === null) return <span>-</span>;
  const pct = Math.round(value * 100);
  return (
    <div className="swordMeter" title={`${(value * 100).toFixed(1)}%`}>
      <div className="swordMeter__track">
        <div
          className="swordMeter__fill"
          style={{ width: `${pct}%`, background: SEVERITY_COLORS[getSeverity(value)] }}
        />
      </div>
      <span className="swordMeter__label">{pct}%</span>
    </div>
  );
};

export const RoleBadge = ({ role }: { role: SwordRole }) =>
  role === 'admin' ? (
    <EuiBadge color="#2b34c7" iconType="starFilled">
      Master Administrator
    </EuiBadge>
  ) : role === 'soc' ? (
    <EuiBadge color="primary" iconType="users">
      SOC Team
    </EuiBadge>
  ) : (
    <EuiBadge color="hollow">No SWORD role</EuiBadge>
  );

interface KpiProps {
  title: string;
  value: React.ReactNode;
  icon: string;
  color: string;
  hint?: React.ReactNode;
  loading?: boolean;
  onClick?: () => void;
}

export const KpiCard = ({ title, value, icon, color, hint, loading, onClick }: KpiProps) => (
  <EuiPanel
    className={`swordKpi ${onClick ? 'swordKpi--clickable' : ''}`}
    style={{ borderTopColor: color }}
    paddingSize="m"
    onClick={onClick}
    {...(onClick ? { role: 'button', 'aria-label': title } : {})}
  >
    <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <div className="swordKpi__icon" style={{ background: `${color}22`, color }}>
          <EuiIcon type={icon} size="l" color={color} />
        </div>
      </EuiFlexItem>
      <EuiFlexItem style={{ minWidth: 0 }}>
        <EuiText size="xs" color="subdued" className="swordKpi__title">
          {title}
        </EuiText>
        {loading ? <EuiLoadingContent lines={1} /> : <div className="swordKpi__value">{value}</div>}
        {hint && (
          <EuiText size="xs" color="subdued" className="swordKpi__hint">
            {hint}
          </EuiText>
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  </EuiPanel>
);

interface SectionProps {
  title: React.ReactNode;
  icon?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
}

export const Section = ({
  title,
  icon,
  action,
  children,
  className,
  description,
}: SectionProps) => (
  <EuiPanel className={`swordSection ${className ?? ''}`} paddingSize="l">
    <EuiFlexGroup
      alignItems="center"
      justifyContent="spaceBetween"
      gutterSize="s"
      responsive={false}
    >
      <EuiFlexItem grow={false}>
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          {icon && (
            <EuiFlexItem grow={false}>
              <EuiIcon type={icon} size="m" />
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiTitle size="xs">
              <h3>{title}</h3>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      {action && <EuiFlexItem grow={false}>{action}</EuiFlexItem>}
    </EuiFlexGroup>
    {description && (
      <EuiText size="s" color="subdued" style={{ marginTop: 4 }}>
        {description}
      </EuiText>
    )}
    <div className="swordSection__body">{children}</div>
  </EuiPanel>
);
