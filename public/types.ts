import { NavigationPublicPluginStart } from '../../../src/plugins/navigation/public';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SwordMachineLearningPluginSetup {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SwordMachineLearningPluginStart {}

export interface AppPluginStartDependencies {
  navigation: NavigationPublicPluginStart;
}
