import { createHash } from 'crypto';
import {
  ISavedObjectsRepository,
  Logger,
  OpenSearchClient,
  SavedObjectsErrorHelpers,
} from '../../../../src/core/server';
import { AccessInfo, ManagedUser, SwordRole, USER_STATE_SO_TYPE } from '../../common';
import { SwordConfig } from '../config';

interface AuthInfo {
  user_name: string;
  roles?: string[];
  backend_roles?: string[];
}

interface UserStateAttributes {
  username: string;
  mustChangePassword: boolean;
  passwordChangedAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

const userStateId = (username: string) =>
  `user-${createHash('sha256').update(username).digest('hex')}`;

/**
 * Resolves who the caller is from the OpenSearch security plugin (authinfo, called with the caller's
 * own credentials) and maps their security roles to a SWORD role. Deny by default: anything that is
 * not an explicit admin/SOC role, or any failure to identify the user, yields role "none".
 */
export class AccessService {
  constructor(
    private readonly config: SwordConfig['access'],
    private readonly getRepository: () => ISavedObjectsRepository,
    private readonly logger: Logger
  ) {}

  public get adminRoles() {
    return this.config.adminRoles;
  }

  public get socRoles() {
    return this.config.socRoles;
  }

  public get enforcePasswordChange() {
    return this.config.enforcePasswordChange;
  }

  roleFor(roles: string[]): SwordRole {
    if (roles.some((r) => this.config.adminRoles.includes(r))) return 'admin';
    if (roles.some((r) => this.config.socRoles.includes(r))) return 'soc';
    return 'none';
  }

  async resolve(client: OpenSearchClient): Promise<AccessInfo> {
    let info: AuthInfo;
    try {
      const { body } = await client.transport.request({
        method: 'GET',
        path: '/_plugins/_security/authinfo',
      });
      info = body as AuthInfo;
    } catch (e) {
      // Not authenticated: let core answer 401 (with WWW-Authenticate) so the user can sign in.
      if ((e as any)?.statusCode === 401) throw e;
      this.logger.debug(`authinfo failed: ${(e as Error).message}`);
      return {
        username: '',
        role: 'none',
        roles: [],
        backendRoles: [],
        mustChangePassword: false,
        canChangePassword: false,
      };
    }

    const roles = info.roles ?? [];
    const role = this.roleFor(roles);
    const isServiceAccount = roles.some((r) => this.config.serviceRoles.includes(r));
    let mustChangePassword = false;
    if (role === 'soc' && this.config.enforcePasswordChange && !isServiceAccount) {
      const state = await this.getUserState(info.user_name);
      mustChangePassword = !state || state.mustChangePassword;
    }
    return {
      username: info.user_name,
      role,
      roles,
      backendRoles: info.backend_roles ?? [],
      mustChangePassword,
      canChangePassword: !isServiceAccount,
    };
  }

  async getUserState(username: string): Promise<UserStateAttributes | null> {
    try {
      const so = await this.getRepository().get<UserStateAttributes>(
        USER_STATE_SO_TYPE,
        userStateId(username)
      );
      return so.attributes;
    } catch (e) {
      if (SavedObjectsErrorHelpers.isNotFoundError(e as Error)) return null;
      throw e;
    }
  }

  async markPasswordChanged(username: string) {
    const now = new Date().toISOString();
    await this.getRepository().create<UserStateAttributes>(
      USER_STATE_SO_TYPE,
      {
        username,
        mustChangePassword: false,
        passwordChangedAt: now,
        updatedBy: username,
        updatedAt: now,
      },
      { id: userStateId(username), overwrite: true }
    );
  }

  async requirePasswordChange(username: string, by: string) {
    const existing = await this.getUserState(username);
    const now = new Date().toISOString();
    await this.getRepository().create<UserStateAttributes>(
      USER_STATE_SO_TYPE,
      { ...(existing ?? { username }), mustChangePassword: true, updatedBy: by, updatedAt: now },
      { id: userStateId(username), overwrite: true }
    );
  }

  async listUserStates(): Promise<Map<string, UserStateAttributes>> {
    const result = await this.getRepository().find<UserStateAttributes>({
      type: USER_STATE_SO_TYPE,
      perPage: 1000,
    });
    return new Map(result.saved_objects.map((so) => [so.attributes.username, so.attributes]));
  }

  toManagedUser(username: string, role: SwordRole, state?: UserStateAttributes): ManagedUser {
    return {
      username,
      role,
      passwordChangedAt: state?.passwordChangedAt,
      mustChangePassword:
        role === 'soc' && this.config.enforcePasswordChange && (!state || state.mustChangePassword),
      updatedBy: state?.updatedBy,
    };
  }
}
