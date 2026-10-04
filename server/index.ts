import { PluginConfigDescriptor, PluginInitializerContext } from '../../../src/core/server';
import { configSchema, SwordConfig } from './config';
import { SwordMachineLearningPlugin } from './plugin';

export const config: PluginConfigDescriptor<SwordConfig> = {
  schema: configSchema,
};

export function plugin(initializerContext: PluginInitializerContext<SwordConfig>) {
  return new SwordMachineLearningPlugin(initializerContext);
}

export { SwordMachineLearningPluginSetup, SwordMachineLearningPluginStart } from './types';
