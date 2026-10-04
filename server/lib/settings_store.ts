import { ISavedObjectsRepository, SavedObjectsErrorHelpers } from '../../../../src/core/server';
import {
  DEFAULT_FCM_BODY,
  DEFAULT_FCM_TITLE,
  DashboardSettings,
  FcmSettings,
  SETTINGS_SO_ID,
  SETTINGS_SO_TYPE,
  SwordSettings,
} from '../../common';
import { SecretBox } from './secret_box';

type StoredFcm = Omit<FcmSettings, 'serviceAccount' | 'serviceAccountSet'> & {
  serviceAccountEnc?: string;
};

interface StoredSettings {
  fcm: StoredFcm;
  dashboard: DashboardSettings;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Settings with secrets decrypted, for server-side use only. Never send this to the browser. */
export interface ResolvedSettings {
  fcm: StoredFcm & { serviceAccount?: ServiceAccount };
  dashboard: DashboardSettings;
}

/** Secret fields: undefined = keep stored value, null = remove, string = replace. */
export interface SettingsPatch {
  fcm?: Partial<StoredFcm> & { serviceAccount?: string | null };
  dashboard?: Partial<DashboardSettings>;
}

export const DEFAULT_SETTINGS: StoredSettings = {
  fcm: {
    enabled: false,
    deviceTokens: [],
    title: DEFAULT_FCM_TITLE,
    body: DEFAULT_FCM_BODY,
    cooldownSeconds: 300,
    minConfidence: 0.5,
    families: [],
  },
  dashboard: {
    refreshSeconds: 30,
    liveToasts: true,
  },
};

export function parseServiceAccount(json: string): ServiceAccount {
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Service account is not valid JSON');
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('Service account JSON must contain project_id, client_email and private_key');
  }
  return parsed as ServiceAccount;
}

export class SettingsStore {
  constructor(
    private readonly getRepository: () => ISavedObjectsRepository,
    private readonly getSecretBox: () => SecretBox
  ) {}

  private async readStored(): Promise<StoredSettings> {
    try {
      const so = await this.getRepository().get<StoredSettings>(SETTINGS_SO_TYPE, SETTINGS_SO_ID);
      const a = so.attributes;
      return {
        ...a,
        fcm: { ...DEFAULT_SETTINGS.fcm, ...a.fcm },
        dashboard: { ...DEFAULT_SETTINGS.dashboard, ...a.dashboard },
      };
    } catch (e) {
      if (SavedObjectsErrorHelpers.isNotFoundError(e as Error)) return DEFAULT_SETTINGS;
      throw e;
    }
  }

  /** Applies a patch to stored settings, encrypting new secrets. Pure apart from encryption. */
  private apply(stored: StoredSettings, patch: SettingsPatch): StoredSettings {
    const box = this.getSecretBox();
    const { serviceAccount, ...fcmRest } = patch.fcm ?? {};

    const fcm: StoredFcm = { ...stored.fcm, ...fcmRest };
    if (serviceAccount === null) {
      delete fcm.serviceAccountEnc;
      delete fcm.projectId;
      delete fcm.clientEmail;
    } else if (serviceAccount) {
      const sa = parseServiceAccount(serviceAccount);
      fcm.serviceAccountEnc = box.encrypt(serviceAccount);
      fcm.projectId = sa.project_id;
      fcm.clientEmail = sa.client_email;
    }

    return {
      ...stored,
      fcm,
      dashboard: { ...stored.dashboard, ...(patch.dashboard ?? {}) },
    };
  }

  private resolve(stored: StoredSettings): ResolvedSettings {
    const box = this.getSecretBox();
    const { serviceAccountEnc, ...fcm } = stored.fcm;
    return {
      fcm: {
        ...fcm,
        serviceAccount: serviceAccountEnc
          ? parseServiceAccount(box.decrypt(serviceAccountEnc))
          : undefined,
      },
      dashboard: stored.dashboard,
    };
  }

  private toPublic(stored: StoredSettings): SwordSettings {
    const { serviceAccountEnc, ...fcm } = stored.fcm;
    return {
      fcm: { ...fcm, serviceAccountSet: Boolean(serviceAccountEnc) },
      dashboard: stored.dashboard,
      updatedAt: stored.updatedAt,
      updatedBy: stored.updatedBy,
    };
  }

  /** Settings safe to send to an administrator's browser (secrets masked). */
  async getPublic(): Promise<SwordSettings> {
    return this.toPublic(await this.readStored());
  }

  async getDashboard(): Promise<DashboardSettings> {
    return (await this.readStored()).dashboard;
  }

  async getResolved(patch?: SettingsPatch): Promise<ResolvedSettings> {
    const stored = await this.readStored();
    return this.resolve(patch ? this.apply(stored, patch) : stored);
  }

  async update(patch: SettingsPatch, by: string): Promise<SwordSettings> {
    const next = {
      ...this.apply(await this.readStored(), patch),
      updatedAt: new Date().toISOString(),
      updatedBy: by,
    };
    await this.getRepository().create(SETTINGS_SO_TYPE, next, {
      id: SETTINGS_SO_ID,
      overwrite: true,
    });
    return this.toPublic(next);
  }
}
