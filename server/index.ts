import { PluginInitializerContext } from '../../../src/core/server';
import { SwordMachineLearningPlugin } from './plugin';

// This exports static code and TypeScript types,
// as well as, OpenSearch Dashboards Platform `plugin()` initializer.

export function plugin(initializerContext: PluginInitializerContext) {
  return new SwordMachineLearningPlugin(initializerContext);
}

export { SwordMachineLearningPluginSetup, SwordMachineLearningPluginStart } from './types';
