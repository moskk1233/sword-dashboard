import { schema } from '@osd/config-schema';
import { IRouter, OpenSearchClient } from '../../../../src/core/server';
import {
  API_BASE,
  AccessOverview,
  DEFAULT_ADMIN_ROLE,
  DEFAULT_SOC_ROLE,
  ManagedUser,
  ML_FIELD,
  SURICATA_RULE_GROUP,
} from '../../common';
import { SwordConfig } from '../config';
import { AccessService } from '../lib/access';
import { Guard, errorMessage } from './guard';

const SECURITY_API = '/_plugins/_security/api';

const username = schema.string({
  minLength: 1,
  maxLength: 128,
  validate: (v) => (/^[\w.@-]+$/.test(v) ? undefined : 'Invalid username'),
});

/** Least-privilege role definitions the Master Administrator can install from the UI. */
export function roleDefinitions(config: SwordConfig) {
  const read = ['read'];
  return {
    [DEFAULT_SOC_ROLE]: {
      description: 'SWORD SOC team: read-only access to ML detections and Suricata alerts',
      cluster_permissions: ['cluster_composite_ops_ro'],
      index_permissions: [
        {
          index_patterns: [config.alertsIndexPattern],
          // Document-level security: SOC members only see SWORD-related alerts.
          dls: JSON.stringify({
            bool: {
              should: [
                { exists: { field: ML_FIELD } },
                { term: { 'rule.groups': SURICATA_RULE_GROUP } },
              ],
              minimum_should_match: 1,
            },
          }),
          allowed_actions: read,
        },
        { index_patterns: [config.monitoringIndexPattern], allowed_actions: read },
      ],
      tenant_permissions: [
        { tenant_patterns: ['global_tenant'], allowed_actions: ['kibana_all_read'] },
      ],
    },
    [DEFAULT_ADMIN_ROLE]: {
      description: 'SWORD Master Administrator: SWORD dashboard and settings',
      cluster_permissions: ['cluster_composite_ops_ro'],
      index_permissions: [
        {
          index_patterns: [config.alertsIndexPattern, config.monitoringIndexPattern],
          allowed_actions: read,
        },
      ],
      tenant_permissions: [
        { tenant_patterns: ['global_tenant'], allowed_actions: ['kibana_all_write'] },
      ],
    },
  };
}

async function securityGet(client: OpenSearchClient, path: string) {
  const { body } = await client.transport.request({
    method: 'GET',
    path: `${SECURITY_API}${path}`,
  });
  return body as Record<string, any>;
}

const PASSWORD_RULES: Array<[RegExp, string]> = [
  [/.{10,}/, 'at least 10 characters'],
  [/[a-z]/, 'a lowercase letter'],
  [/[A-Z]/, 'an uppercase letter'],
  [/[0-9]/, 'a digit'],
  [/[^A-Za-z0-9]/, 'a symbol'],
];

export function registerAccessRoutes(
  router: IRouter,
  config: SwordConfig,
  guard: Guard,
  access: AccessService
) {
  // Any authenticated user may ask who they are; the UI uses it to show/hide sections.
  router.get(
    { path: `${API_BASE}/access/me`, validate: false },
    async (context, request, response) =>
      response.ok({ body: await access.resolve(context.core.opensearch.client.asCurrentUser) })
  );

  router.post(
    {
      path: `${API_BASE}/account/password`,
      validate: {
        body: schema.object({
          currentPassword: schema.string({ minLength: 1, maxLength: 256 }),
          newPassword: schema.string({ minLength: 1, maxLength: 256 }),
        }),
      },
    },
    guard(
      { level: 'soc', allowPendingPasswordChange: true },
      async (context, request, response, me) => {
        if (!me.canChangePassword) {
          return response.badRequest({
            body: { message: 'This account cannot change its password here' },
          });
        }
        const { currentPassword, newPassword } = request.body;
        const missing = PASSWORD_RULES.filter(([re]) => !re.test(newPassword)).map(([, d]) => d);
        if (missing.length) {
          return response.badRequest({ body: { message: `Password needs ${missing.join(', ')}` } });
        }
        if (newPassword === currentPassword) {
          return response.badRequest({
            body: { message: 'New password must differ from the current one' },
          });
        }
        if (newPassword.toLowerCase().includes(me.username.toLowerCase())) {
          return response.badRequest({
            body: { message: 'Password must not contain the username' },
          });
        }
        try {
          // Self-service endpoint: verifies current_password and only affects the caller's own account.
          await context.core.opensearch.client.asCurrentUser.transport.request({
            method: 'PUT',
            path: `${SECURITY_API}/account`,
            body: { current_password: currentPassword, password: newPassword },
          });
        } catch (e) {
          return response.badRequest({ body: { message: errorMessage(e) } });
        }
        await access.markPasswordChanged(me.username);
        return response.ok({ body: { ok: true } });
      }
    )
  );

  router.get(
    { path: `${API_BASE}/access/overview`, validate: false },
    guard({ level: 'admin' }, async (context, request, response) => {
      const client = context.core.opensearch.client.asCurrentUser;
      const states = await access.listUserStates();
      const overview: AccessOverview = {
        adminRoles: access.adminRoles,
        socRoles: access.socRoles,
        installedRoles: {},
        users: [],
        enforcePasswordChange: access.enforcePasswordChange,
      };
      try {
        const [roles, mappings, users] = await Promise.all([
          securityGet(client, '/roles'),
          securityGet(client, '/rolesmapping'),
          securityGet(client, '/internalusers'),
        ]);
        for (const name of [DEFAULT_ADMIN_ROLE, DEFAULT_SOC_ROLE]) {
          overview.installedRoles[name] = Boolean(roles[name]);
        }
        const managed: ManagedUser[] = [];
        for (const [name, user] of Object.entries(users)) {
          const backend: string[] = user.backend_roles ?? [];
          const effective = new Set<string>(user.opendistro_security_roles ?? []);
          for (const [roleName, mapping] of Object.entries(mappings)) {
            if (
              (mapping.users ?? []).includes(name) ||
              (mapping.backend_roles ?? []).some((b: string) => backend.includes(b))
            ) {
              effective.add(roleName);
            }
          }
          const role = access.roleFor([...effective]);
          if (role !== 'none') managed.push(access.toManagedUser(name, role, states.get(name)));
        }
        overview.users = managed.sort(
          (a, b) => a.role.localeCompare(b.role) || a.username.localeCompare(b.username)
        );
      } catch (e) {
        // The admin may lack security REST API permission; still show what SWORD itself knows.
        overview.securityApiError = errorMessage(e);
        overview.users = [...states.values()].map((s) =>
          access.toManagedUser(s.username, 'soc', s)
        );
      }
      return response.ok({ body: overview });
    })
  );

  router.post(
    {
      path: `${API_BASE}/access/users/{username}/require-password-change`,
      validate: { params: schema.object({ username }) },
    },
    guard({ level: 'admin' }, async (context, request, response, me) => {
      await access.requirePasswordChange(request.params.username, me.username);
      return response.ok({ body: { ok: true } });
    })
  );

  // Adds/removes an existing internal user to the SWORD SOC role mapping.
  router.post(
    {
      path: `${API_BASE}/access/soc-members`,
      validate: {
        body: schema.object({
          username,
          action: schema.oneOf([schema.literal('add'), schema.literal('remove')]),
        }),
      },
    },
    guard({ level: 'admin' }, async (context, request, response, me) => {
      const client = context.core.opensearch.client.asCurrentUser;
      const { username: target, action } = request.body;
      if (action === 'add' && target === me.username) {
        return response.badRequest({ body: { message: 'You cannot change your own role' } });
      }
      let mapping: Record<string, any> = {};
      try {
        mapping =
          (await securityGet(client, `/rolesmapping/${DEFAULT_SOC_ROLE}`))[DEFAULT_SOC_ROLE] ?? {};
      } catch (e: any) {
        if (e?.meta?.statusCode !== 404) throw e;
      }
      const users = new Set<string>(mapping.users ?? []);
      if (action === 'add') users.add(target);
      else users.delete(target);
      await client.transport.request({
        method: 'PUT',
        path: `${SECURITY_API}/rolesmapping/${DEFAULT_SOC_ROLE}`,
        body: {
          users: [...users],
          backend_roles: mapping.backend_roles ?? [],
          hosts: mapping.hosts ?? [],
        },
      });
      // A member with no password-change record is asked to set their own password on first login.
      return response.ok({ body: { ok: true } });
    })
  );

  router.post(
    { path: `${API_BASE}/access/roles/install`, validate: false },
    guard({ level: 'admin' }, async (context, request, response) => {
      const client = context.core.opensearch.client.asCurrentUser;
      for (const [name, definition] of Object.entries(roleDefinitions(config))) {
        await client.transport.request({
          method: 'PUT',
          path: `${SECURITY_API}/roles/${name}`,
          body: definition,
        });
      }
      return response.ok({ body: { ok: true } });
    })
  );
}
