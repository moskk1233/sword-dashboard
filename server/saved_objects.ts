import { SavedObjectsType } from '../../../src/core/server';
import { NOTIFIER_SO_TYPE, SETTINGS_SO_TYPE, USER_STATE_SO_TYPE } from '../common';

const base = {
  hidden: true,
  namespaceType: 'agnostic' as const,
};

export const savedObjectTypes: SavedObjectsType[] = [
  {
    ...base,
    name: SETTINGS_SO_TYPE,
    // Settings are stored as an opaque object (secrets encrypted); nothing needs to be searchable.
    mappings: { dynamic: false, properties: { updatedAt: { type: 'date' } } },
  },
  {
    ...base,
    name: USER_STATE_SO_TYPE,
    mappings: {
      dynamic: false,
      properties: {
        username: { type: 'keyword' },
        mustChangePassword: { type: 'boolean' },
        passwordChangedAt: { type: 'date' },
      },
    },
  },
  {
    ...base,
    name: NOTIFIER_SO_TYPE,
    mappings: { dynamic: false, properties: { cursor: { type: 'date' } } },
  },
];
