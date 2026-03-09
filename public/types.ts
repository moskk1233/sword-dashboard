import { NavigationPublicPluginStart } from '../../../src/plugins/navigation/public';

export interface SwordMachineLearningPluginSetup {
  getGreeting: () => string;
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SwordMachineLearningPluginStart {}

export interface AppPluginStartDependencies {
  navigation: NavigationPublicPluginStart;
}
