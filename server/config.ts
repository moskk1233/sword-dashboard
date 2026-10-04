import { schema, TypeOf } from '@osd/config-schema';

export const configSchema = schema.object({
  enabled: schema.boolean({ defaultValue: true }),
  alertsIndexPattern: schema.string({ defaultValue: 'wazuh-alerts-*' }),
  monitoringIndexPattern: schema.string({ defaultValue: 'wazuh-monitoring-*' }),
  access: schema.object({
    // OpenSearch security roles (not backend roles) that grant each SWORD role.
    adminRoles: schema.arrayOf(schema.string(), { defaultValue: ['all_access', 'sword_admin'] }),
    socRoles: schema.arrayOf(schema.string(), { defaultValue: ['sword_soc'] }),
    // SOC members must change the password the Master Administrator gave them before using SWORD.
    enforcePasswordChange: schema.boolean({ defaultValue: true }),
    // Roles whose accounts must never use the self-service password API (shared service accounts).
    serviceRoles: schema.arrayOf(schema.string(), { defaultValue: ['kibana_server'] }),
  }),
  notifier: schema.object({
    enabled: schema.boolean({ defaultValue: true }),
    intervalSeconds: schema.number({ defaultValue: 10, min: 5, max: 3600 }),
    // Time zone used for {time} in FCM messages.
    timeZone: schema.string({ defaultValue: 'Asia/Bangkok' }),
  }),
  // Key used to encrypt secrets (Firebase service account) at rest. When unset a random key
  // is generated in <path.data>/sword_secret.key. Set it explicitly when running several dashboards nodes.
  encryptionKey: schema.maybe(schema.string({ minLength: 32 })),
});

export type SwordConfig = TypeOf<typeof configSchema>;
