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
(globalThis as { window?: unknown }).window = { location: { origin: 'https://lxa.test' } };

type BackupToJson = (path: string, options?: unknown) => Promise<{ metadata: InstanceBackup[] }>;

const state = {
  collectionResponse: [] as InstanceBackup[],
  operationResponse: null as unknown,
  waitMetadata: { status_code: 200, status: 'Done' } as unknown,
  waitResponses: undefined as unknown[] | undefined,
  waitCalls: 0,
  onFetch: undefined as (() => void) | undefined,
  waitGate: undefined as Promise<void> | undefined,
};

mock.module(TRANSPORT_PATH, () => {
  return {
    requestJson: (async () => {
      await state.onFetch?.();
      return { metadata: state.collectionResponse };
    }) as unknown as BackupToJson,
    requestOperation: async () => state.operationResponse,
    requestIncusJson: async () => {
      await state.waitGate;
      state.waitCalls += 1;
      const next = state.waitResponses?.shift();
      return { metadata: next ?? state.waitMetadata };
    },
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

  test('converges when a refetch is invalidated mid-flight (mutation inline fix)', async () => {
    const store = new IncusStore();
    const requests = new RequestRegistry();
    const key = instanceKey('default', 'test');
    const collectionKey = resourceKeys.instanceBackupsCollection(key);
    store.ensureInstance(key);
    store.update((draft) => {
      draft.instances.items[key].backups.collection = { status: 'stale' };
    }, [collectionKey]);

    // An operation event lands while the refetch is in flight and invalidates
    // the collection again. The fence discards the response and re-marks
    // 'stale' — the ensure itself must not publish the invalidated data, and a
    // follow-up ensure (what the version-based hook effect does) must converge.
    let fetchCount = 0;
    state.onFetch = () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        store.update((draft) => {
          draft.instances.items[key].backups.collection = { status: 'stale' };
        }, [collectionKey]);
      }
    };
    state.collectionResponse = [];
    await ensureInstanceBackups(store, requests, {
      instanceName: 'test',
      project: 'default',
    });

    const afterDiscard = store.getSnapshot().state.instances.items[key];
    expect(afterDiscard.backups.collection.status).toBe('stale');
    expect(Object.keys(afterDiscard.backups.items)).toEqual([]);

    state.collectionResponse = [fixture];
    state.onFetch = undefined;
    await ensureInstanceBackups(store, requests, {
      instanceName: 'test',
      project: 'default',
    });

    const item = store.getSnapshot().state.instances.items[key];
    expect(item.backups.collection.status).toBe('ready');
    expect(Object.keys(item.backups.items)).toEqual(['backup-1']);
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

describe('createInstanceBackupsResource.create', () => {
  function setup() {
    const store = new IncusStore();
    const requests = new RequestRegistry();
    const key = instanceKey('default', 'test');
    store.ensureInstance(key);
    // Seed one backup so markStale resolves to 'stale' (not 'missing') —
    // that makes the ordering observable against the pre-create 'ready' state.
    store.update((draft) => {
      draft.instances.items[key].backups.items['backup-1'] = {
        metadata: { status: 'ready', data: fixture },
      };
      draft.instances.items[key].backups.collection = { status: 'ready' };
    }, [resourceKeys.instanceBackupsCollection(key)]);
    const resource = createInstanceBackupsResource(store, requests);
    return { store, key, resource };
  }

  test('flags the list stale only after the create operation completed', async () => {
    const { store, key, resource } = setup();
    let releaseWait!: () => void;
    state.waitGate = new Promise<void>((resolve) => {
      releaseWait = resolve;
    });
    state.operationResponse = { operation: '/1.0/operations/op-1' };
    state.waitMetadata = { status_code: 200, status: 'Done' };

    const creating = resource.create({ instanceName: 'test', project: 'default' }, {});

    // While incusd is still running the backup operation the early list
    // refetch must not already have been triggered (would flip to 'ready'
    // without the new backup and never refresh again).
    const statusBefore =
      store.getSnapshot().state.instances.items[key]?.backups.collection?.status;
    expect(statusBefore).toBe('ready');

    releaseWait();
    await creating;

    const item = store.getSnapshot().state.instances.items[key];
    expect(item.backups.collection.status).toBe('stale');
  });

  test('keeps polling /wait while the operation reports Running', async () => {
    const { store, key, resource } = setup();
    state.waitGate = undefined;
    state.waitCalls = 0;
    // 30s timeout polls return the current state; long backups outlast them.
    state.waitResponses = [
      { status_code: 103, status: 'Running' },
      { status_code: 103, status: 'Running' },
      { status_code: 200, status: 'Done' },
    ];
    state.operationResponse = { operation: '/1.0/operations/op-1' };

    await resource.create({ instanceName: 'test', project: 'default' }, {});

    expect(state.waitCalls).toBe(3);
    const item = store.getSnapshot().state.instances.items[key];
    expect(item.backups.collection.status).toBe('stale');
  });

  test('throws when a poll reports the operation failed', async () => {
    const { store, key, resource } = setup();
    state.waitGate = undefined;
    state.waitCalls = 0;
    state.waitResponses = [
      { status_code: 103, status: 'Running' },
      { status_code: 400, status: 'Failure', err: 'disk full' },
    ];
    state.operationResponse = { operation: '/1.0/operations/op-1' };

    await expect(
      resource.create({ instanceName: 'test', project: 'default' }, {}),
    ).rejects.toThrow('disk full');

    expect(state.waitCalls).toBe(2);
    const item = store.getSnapshot().state.instances.items[key];
    expect(item.backups.collection.status).toBe('ready');
  });

  test('does not flag stale when the create operation failed', async () => {
    const { store, key, resource } = setup();
    state.waitGate = undefined;
    state.operationResponse = { operation: '/1.0/operations/op-1' };
    state.waitMetadata = { status_code: 400, status: 'Failure', err: 'disc full' };

    await expect(
      resource.create({ instanceName: 'test', project: 'default' }, {}),
    ).rejects.toThrow('disc full');

    const item = store.getSnapshot().state.instances.items[key];
    expect(item.backups.collection.status).toBe('ready');
  });
});
