import {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
} from '../../../src/core/server';

import { SwordMachineLearningPluginSetup, SwordMachineLearningPluginStart } from './types';
import { defineRoutes } from './routes';

export class SwordMachineLearningPlugin
  implements Plugin<SwordMachineLearningPluginSetup, SwordMachineLearningPluginStart> {
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup) {
    this.logger.debug('swordMachineLearning: Setup');
    const router = core.http.createRouter();

    // Register server side APIs
    defineRoutes(router);

    return {};
  }

  public start(core: CoreStart) {
    this.logger.debug('swordMachineLearning: Started');
    return {};
  }

  public stop() {}
}
