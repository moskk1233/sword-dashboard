export const PLUGIN_ID = 'swordMachineLearning';
export const PLUGIN_NAME = 'SWORD';
export const PLUGIN_TITLE = 'SWORD Dashboard';

export const API_BASE = '/api/sword_machine_learning';

// Fields written by the SWORD agent (ml_log.json) and decoded by rule 100002 (group ml_predictions).
export const ML_FIELD = 'data.predicted_attack';
export const ML_RULE_GROUP = 'ml_predictions';
export const SURICATA_RULE_GROUP = 'suricata';

// Hidden saved-object types. Hidden types are not reachable through the public saved objects API,
// so only this plugin's server code (using the internal repository) can read them.
export const SETTINGS_SO_TYPE = 'sword-settings';
export const SETTINGS_SO_ID = 'sword-settings';
export const USER_STATE_SO_TYPE = 'sword-user-state';
export const NOTIFIER_SO_TYPE = 'sword-notifier-state';
export const NOTIFIER_SO_ID = 'sword-notifier-state';

// Default OpenSearch security role names that the plugin can install.
export const DEFAULT_ADMIN_ROLE = 'sword_admin';
export const DEFAULT_SOC_ROLE = 'sword_soc';

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

export * from './types';
export * from './attack_types';
export * from './template';
