import { AppMountParameters, CoreSetup, CoreStart, Plugin } from '../../../src/core/public';
import { PLUGIN_ID, PLUGIN_TITLE } from '../common';
import {
  AppPluginStartDependencies,
  SwordMachineLearningPluginSetup,
  SwordMachineLearningPluginStart,
} from './types';

export class SwordMachineLearningPlugin
  implements Plugin<SwordMachineLearningPluginSetup, SwordMachineLearningPluginStart> {
  public setup(core: CoreSetup): SwordMachineLearningPluginSetup {
    core.application.register({
      id: PLUGIN_ID,
      title: PLUGIN_TITLE,
      euiIconType: 'securityAnalyticsApp',
      category: {
        id: PLUGIN_ID,
        label: 'SWORD',
        order: 1,
        euiIconType: 'securityAnalyticsApp',
      },
      async mount(params: AppMountParameters) {
        const { renderApp } = await import('./application');
        const [coreStart, depsStart] = await core.getStartServices();
        return renderApp(coreStart, depsStart as AppPluginStartDependencies, params);
      },
    });
    return {};
  }

  public start(core: CoreStart): SwordMachineLearningPluginStart {
    return {};
  }

  public stop() {}
}
