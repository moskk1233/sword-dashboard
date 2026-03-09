import './index.scss';

import { SwordMachineLearningPlugin } from './plugin';

// This exports static code and TypeScript types,
// as well as, OpenSearch Dashboards Platform `plugin()` initializer.
export function plugin() {
  return new SwordMachineLearningPlugin();
}
export { SwordMachineLearningPluginSetup, SwordMachineLearningPluginStart } from './types';
