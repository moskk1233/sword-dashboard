import { first } from 'rxjs/operators';
import {
  CoreSetup,
  CoreStart,
  ISavedObjectsRepository,
  Logger,
  OpenSearchClient,
  Plugin,
  PluginInitializerContext,
} from '../../../src/core/server';
import { NOTIFIER_SO_TYPE, PLUGIN_ID, SETTINGS_SO_TYPE, USER_STATE_SO_TYPE } from '../common';
import { SwordConfig } from './config';
import { AccessService } from './lib/access';
import { Notifier } from './lib/notifier';
import { SecretBox } from './lib/secret_box';
import { SettingsStore } from './lib/settings_store';
import { defineRoutes } from './routes';
import { savedObjectTypes } from './saved_objects';
import { SwordMachineLearningPluginSetup, SwordMachineLearningPluginStart } from './types';

export class SwordMachineLearningPlugin
  implements Plugin<SwordMachineLearningPluginSetup, SwordMachineLearningPluginStart> {
  private readonly logger: Logger;
  private repository?: ISavedObjectsRepository;
  private internalClient?: OpenSearchClient;
  private secretBox?: SecretBox;
  private notifier?: Notifier;

  constructor(private readonly initializerContext: PluginInitializerContext<SwordConfig>) {
    this.logger = initializerContext.logger.get();
  }

  public async setup(core: CoreSetup) {
    const config = await this.initializerContext.config.create().pipe(first()).toPromise();
    const globalConfig = await this.initializerContext.config.legacy.globalConfig$
      .pipe(first())
      .toPromise();

    savedObjectTypes.forEach((type) => core.savedObjects.registerType(type));

    const getRepository = () => {
      if (!this.repository) throw new Error('SWORD plugin has not started yet');
      return this.repository;
    };
    const getSecretBox = () => {
      if (!this.secretBox) throw new Error('SWORD secret key is not available');
      return this.secretBox;
    };

    this.secretBox = await SecretBox.create(
      config.encryptionKey,
      globalConfig.path.data,
      this.logger
    );

    const access = new AccessService(config.access, getRepository, this.logger.get('access'));
    const settings = new SettingsStore(getRepository, getSecretBox);
    this.notifier = new Notifier({
      logger: this.logger.get('notifier'),
      config,
      getClient: () => {
        if (!this.internalClient) throw new Error('SWORD plugin has not started yet');
        return this.internalClient;
      },
      getRepository,
      settings,
    });

    defineRoutes(core.http.createRouter(), { config, access, settings, notifier: this.notifier });

    // Hide the SWORD app from users without a SWORD role. Routes enforce this independently.
    core.capabilities.registerSwitcher(async (request, capabilities) => {
      if (capabilities.navLinks?.[PLUGIN_ID] === undefined) return {};
      try {
        const [coreStart] = await core.getStartServices();
        const me = await access.resolve(
          coreStart.opensearch.client.asScoped(request).asCurrentUser
        );
        return me.role === 'none' ? { navLinks: { [PLUGIN_ID]: false } } : {};
      } catch {
        // Not signed in yet: keep the link; the app and every route still require a SWORD role.
        return {};
      }
    });

    return {};
  }

  public start(core: CoreStart) {
    this.repository = core.savedObjects.createInternalRepository([
      SETTINGS_SO_TYPE,
      USER_STATE_SO_TYPE,
      NOTIFIER_SO_TYPE,
    ]);
    // The notifier runs without a user request, so it uses the dashboards server identity.
    this.internalClient = core.opensearch.client.asInternalUser;
    this.notifier?.start();
    return {};
  }

  public stop() {
    this.notifier?.stop();
  }
}
