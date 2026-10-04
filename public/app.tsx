import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Redirect, Route, Router, Switch, useHistory, useLocation } from 'react-router-dom';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPage,
  EuiPageBody,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { ScopedHistory } from '../../../src/core/public';
import { CoreStart } from '../../../src/core/public';
import { AccessInfo, DashboardSettings, PASSWORD_CHANGE_REQUIRED, PLUGIN_TITLE } from '../common';
import { SwordApi, errorText } from './api';
import { RoleBadge } from './components/common';
import { useLiveAlerts } from './components/use_live_alerts';
import { AccessPage } from './pages/access_page';
import { AgentsPage } from './pages/agents_page';
import { ChangePasswordPage } from './pages/change_password_page';
import { OverviewPage } from './pages/overview_page';
import { SettingsPage } from './pages/settings_page';

export interface AppContext {
  core: CoreStart;
  api: SwordApi;
  access: AccessInfo;
  ui: DashboardSettings;
  darkMode: boolean;
}

interface TabDef {
  id: string;
  path: string;
  name: string;
  icon: string;
  adminOnly?: boolean;
}

const TABS: TabDef[] = [
  { id: 'overview', path: '/overview', name: 'Attack Monitor', icon: 'visBarVerticalStacked' },
  { id: 'agents', path: '/agents', name: 'Agents', icon: 'node' },
  {
    id: 'notifications',
    path: '/notifications',
    name: 'Notifications',
    icon: 'bell',
    adminOnly: true,
  },
  { id: 'access', path: '/access', name: 'Access Control', icon: 'lock', adminOnly: true },
];

const Header = ({
  ctx,
  desktopEnabled,
  onToggleDesktop,
}: {
  ctx: AppContext;
  desktopEnabled: boolean;
  onToggleDesktop: () => void;
}) => {
  const history = useHistory();
  const location = useLocation();
  const tabs = TABS.filter((t) => !t.adminOnly || ctx.access.role === 'admin');

  return (
    <div className="swordHeader">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" gutterSize="m" wrap>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
            <EuiFlexItem grow={false}>
              <div className="swordHeader__logo">
                <EuiIcon type="securityAnalyticsApp" size="xl" color="ghost" />
              </div>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <h1 className="swordHeader__title">{PLUGIN_TITLE}</h1>
              <EuiText size="xs" className="swordHeader__subtitle">
                Suricata-Wazuh for Offensive-attack Recognition &amp; Detection
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={
                  desktopEnabled
                    ? 'Desktop notifications are on while SWORD is open'
                    : 'Enable desktop notifications while SWORD is open'
                }
              >
                <EuiButtonIcon
                  iconType={desktopEnabled ? 'bell' : 'bellSlash'}
                  color="ghost"
                  display={desktopEnabled ? 'fill' : 'empty'}
                  aria-label="Toggle desktop notifications"
                  onClick={onToggleDesktop}
                />
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false} className="swordHeader__user">
              <EuiText size="s">
                <EuiIcon type="user" /> <strong>{ctx.access.username}</strong>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <RoleBadge role={ctx.access.role} />
            </EuiFlexItem>
            {ctx.access.canChangePassword && (
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  size="xs"
                  color="ghost"
                  iconType="lockOpen"
                  onClick={() => history.push('/account')}
                >
                  Change password
                </EuiButtonEmpty>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiTabs className="swordHeader__tabs" display="condensed">
        {tabs.map((tab) => (
          <EuiTab
            key={tab.id}
            isSelected={location.pathname.startsWith(tab.path)}
            onClick={() => history.push(tab.path)}
          >
            <EuiIcon type={tab.icon} /> {tab.name}
          </EuiTab>
        ))}
      </EuiTabs>
    </div>
  );
};

const NoAccess = ({ username }: { username: string }) => (
  <EuiEmptyPrompt
    iconType="lock"
    title={<h2>You do not have access to SWORD</h2>}
    body={
      <p>
        {username ? (
          <>
            Signed in as <strong>{username}</strong>.{' '}
          </>
        ) : null}
        Ask the Master Administrator to grant you the SOC Team role (<code>sword_soc</code>).
      </p>
    }
  />
);

export const SwordApp = ({ core, history }: { core: CoreStart; history: ScopedHistory }) => {
  const api = useMemo(() => new SwordApi(core.http), [core.http]);
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [ui, setUi] = useState<DashboardSettings>({ refreshSeconds: 30, liveToasts: true });
  const [error, setError] = useState<string | null>(null);
  const [desktopEnabled, setDesktopEnabled] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );
  const darkMode = core.uiSettings.get('theme:darkMode');

  const loadAccess = useCallback(async () => {
    try {
      const me = await api.me();
      setAccess(me);
      if (me.role !== 'none' && !me.mustChangePassword) {
        setUi(await api.uiSettings());
      }
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);

  useEffect(() => {
    loadAccess();
    core.chrome.setBreadcrumbs([{ text: PLUGIN_TITLE }]);
    core.chrome.docTitle.change(PLUGIN_TITLE);
  }, [loadAccess, core]);

  // A 403 PASSWORD_CHANGE_REQUIRED from any call (e.g. an admin re-flagged the user) re-checks access.
  useEffect(() => {
    const unregister = core.http.intercept({
      responseError: (httpError) => {
        if (
          httpError.response?.status === 403 &&
          httpError.body?.message === PASSWORD_CHANGE_REQUIRED
        ) {
          loadAccess();
        }
      },
    });
    return unregister;
  }, [core.http, loadAccess]);

  const ready = Boolean(access && access.role !== 'none' && !access.mustChangePassword);
  useLiveAlerts(api, core, ready && ui.liveToasts, ui.refreshSeconds, desktopEnabled);

  const toggleDesktop = async () => {
    if (typeof Notification === 'undefined') {
      core.notifications.toasts.addWarning('This browser does not support desktop notifications');
      return;
    }
    if (desktopEnabled) {
      setDesktopEnabled(false);
      return;
    }
    const permission = await Notification.requestPermission();
    setDesktopEnabled(permission === 'granted');
    if (permission !== 'granted') {
      core.notifications.toasts.addWarning('Desktop notifications were blocked by the browser');
    }
  };

  if (error) {
    return (
      <EuiEmptyPrompt
        iconType="alert"
        color="danger"
        title={<h2>Unable to load SWORD</h2>}
        body={error}
      />
    );
  }
  if (!access) {
    return (
      <div className="swordCenter">
        <EuiLoadingSpinner size="xl" />
      </div>
    );
  }
  if (access.role === 'none') return <NoAccess username={access.username} />;
  if (access.mustChangePassword) {
    return <ChangePasswordPage core={core} api={api} access={access} forced />;
  }

  const ctx: AppContext = { core, api, access, ui, darkMode };
  const isAdmin = access.role === 'admin';

  return (
    <Router history={history}>
      <EuiPage className="swordApp" paddingSize="none">
        <EuiPageBody>
          <Header ctx={ctx} desktopEnabled={desktopEnabled} onToggleDesktop={toggleDesktop} />
          <div className="swordContent">
            <Switch>
              <Route path="/overview" render={() => <OverviewPage ctx={ctx} />} />
              <Route path="/agents" render={() => <AgentsPage ctx={ctx} />} />
              {isAdmin && (
                <Route
                  path="/notifications"
                  render={() => <SettingsPage ctx={ctx} onSaved={(s) => setUi(s.dashboard)} />}
                />
              )}
              {isAdmin && <Route path="/access" render={() => <AccessPage ctx={ctx} />} />}
              <Route
                path="/account"
                render={() => <ChangePasswordPage core={core} api={api} access={access} />}
              />
              <Redirect to="/overview" />
            </Switch>
          </div>
        </EuiPageBody>
      </EuiPage>
    </Router>
  );
};
