import { IRouter } from '../../../../src/core/server';
import { SwordConfig } from '../config';
import { AccessService } from '../lib/access';
import { Notifier } from '../lib/notifier';
import { SettingsStore } from '../lib/settings_store';
import { registerAccessRoutes } from './access';
import { registerAttackRoutes } from './attacks';
import { createGuard } from './guard';
import { registerSettingsRoutes } from './settings';

export interface RouteDeps {
  config: SwordConfig;
  access: AccessService;
  settings: SettingsStore;
  notifier: Notifier;
}

export function defineRoutes(router: IRouter, deps: RouteDeps) {
  const guard = createGuard(deps.access);
  registerAttackRoutes(router, deps.config, guard);
  registerSettingsRoutes(router, guard, deps.settings, deps.notifier);
  registerAccessRoutes(router, deps.config, guard, deps.access);
}
