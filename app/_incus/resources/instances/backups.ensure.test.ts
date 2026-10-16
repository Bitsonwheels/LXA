// Focused check for the two Must-fix behaviors in the backups resource:
// 1) a fetch invalidated mid-flight must publish 'stale', not 'ready'
// 2) backup delete must only drop the cached item after the operation succeeded
import { describe, expect, mock, test } from 'bun:test';
import type { InstanceBackup } from '../../types';
import { IncusStore } from '../../store';
import { RequestRegistry } from '../../requests';
import { instanceKey } from '../../keys';
import { resourceKeys } from '../../resources';

// bun's mock.module needs a resolvable module id; keep it absolute so it
// matches the relative import './ensure' uses for the transport module.
const TRANSPORT_PATH = `${import.meta.dir}/../../transport`;

// waitForOperation builds its URL against window.location; provide a minimal
// stub because bun test has no DOM.
(globalThis as { window?: unknown }).window = { location: { origin: 'https://ararat.test' } };

type BackupToJson = (path: string, options?: unknown) => Promise<{ metadata: InstanceBackup[] }>;

const state = {
  collectionResponse: [] as InstanceBackup[],
  operationResponse: null as unknown,
  waitMetadata: { status_code: 200, status: 'Done' } as unknown,
  onFetch: undefined as (() => void) | undefined,
};

mock.module(TRANSPORT_PATH, () => {
  return {
    requestJson: (async () => {
      await state.onFetch?.();
      return { metadata: state.collectionResponse };
    }) as unknown as BackupToJson,
    requestOperation: async () => state.operationResponse,
    requestIncusJson: async () => ({ metadata: state.waitMetadata }),
    requestText: async () => '',
  };
});

const ensureModule = await import(`${import.meta.dir}/backups/ensure.ts`);
const { ensureInstanceBackups, createInstanceBackupsResource } = ensureModule;

const fixture = { name: 'backup-1' } as InstanceBackup;

describe('ensureInstanceBackups', () => {
  test('publishes fresh data as ready when nothing was invalidated in flight', async () => {
    const store = new IncusStore();
    const requests = new RequestRegistry();
    state.collectionResponse = [fixture];
    state.onFetch = undefined;

    await ensureInstanceBackups(store, requests, {
      instanceName: 'test',
      project: 'default',
    });

    const item = store.getSnapshot().state.instances.items[instanceKey('default', 'test')];
    expect(item.backups.collection.status).toBe('ready');
    expect(Object.keys(item.backups.items)).toEqual(['backup-1']);
  });

  test('does not stamp pre-invalidation data as ready', async () => {
    const store = new IncusStore();
    const requests = new RequestRegistry();
    const key = instanceKey('default', 'test');
    const collectionKey = resourceKeys.instanceBackupsCollection(key);
    state.collectionResponse = [fixture];
    // Simulate an event-driven invalidation while the HTTP GET is in flight.
    state.onFetch = () => {
      store.update((draft) => {
        draft.instances.items[key] ??= store.ensureInstance(key);
        draft.instances.items[key].backups.collection = { status: 'stale' };
      }, [collectionKey]);
    };

    await ensureInstanceBackups(store, requests, {
      instanceName: 'test',
      project: 'default',
    });

    const item = store.getSnapshot().state.instances.items[key];
    expect(item.backups.collection.status).toBe('stale');
    // The stale fetch must not wipe whatever the invalidator left in place.
    expect(Object.keys(item.backups.items)).toEqual([]);
  });
});

describe('createInstanceBackupsResource.delete', () => {
  function setup() {
    const store = new IncusStore();
    const requests = new RequestRegistry();
    const key = instanceKey('default', 'test');
    store.ensureInstance(key);
    store.update((draft) => {
      const instance = draft.instances.items[key];
      instance.backups.items['backup-1'] = {
        metadata: { status: 'ready', data: fixture },
      };
    }, [resourceKeys.instanceBackupMetadata(key, 'backup-1')]);
    const resource = createInstanceBackupsResource(store, requests);
    const request = { instanceName: 'test', project: 'default', backupName: 'backup-1' };
    return { store, key, resource, request };
  }

  test('drops the cached item only after the operation succeeded', async () => {
    const { store, key, resource, request } = setup();
    state.operationResponse = { operation: '/1.0/operations/op-1' };
    state.waitMetadata = { status_code: 200, status: 'Done' };

    await resource.delete(request);

    const item = store.getSnapshot().state.instances.items[key];
    expect(item.backups.items['backup-1']).toBeUndefined();
  });

  test('keeps the cached item when the delete operation failed', async () => {
    const { store, key, resource, request } = setup();
    state.operationResponse = { operation: '/1.0/operations/op-1' };
    state.waitMetadata = { status_code: 400, status: 'Failure', err: 'locked' };

    await expect(resource.delete(request)).rejects.toThrow('locked');

    const item = store.getSnapshot().state.instances.items[key];
    expect(item.backups.items['backup-1']).toBeDefined();
  });
});
