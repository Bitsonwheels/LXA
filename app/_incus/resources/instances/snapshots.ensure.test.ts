// Regression check for the snapshot inline refresh deadlock:
// A fetch that gets invalidated mid-flight is fenced (its payload is dropped)
// and the collection is flagged stale so the owning hook refetches. That
// refetch must be a real HTTP request — if the store write happened while the
// request still held the registry slot, the refetch was deduplicated into the
// fenced request and the list stayed on the old data until a full page reload.
import { describe, expect, mock, test } from 'bun:test';
import type { InstanceSnapshot } from '../../types';
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

type SnapshotsToJson = (
  path: string,
  options?: unknown,
) => Promise<{ metadata: InstanceSnapshot[] }>;

const state = {
  collectionResponse: [] as InstanceSnapshot[],
  fetchCount: 0,
  onFetch: undefined as (() => void) | undefined,
};

mock.module(TRANSPORT_PATH, () => {
  return {
    requestJson: (async () => {
      state.fetchCount += 1;
      await state.onFetch?.();
      return { metadata: state.collectionResponse };
    }) as unknown as SnapshotsToJson,
    requestOperation: async () => ({}),
    requestIncusJson: async () => ({ metadata: { status_code: 200, status: 'Done' } }),
    requestText: async () => '',
  };
});

const ensureModule = await import(`${import.meta.dir}/snapshots/ensure.ts`);
const { ensureInstanceSnapshots } = ensureModule;

const key = instanceKey('default', 'test');
const collectionKey = resourceKeys.instanceSnapshotsCollection(key);
const request = { instanceName: 'test', project: 'default' };
const fixture = { name: 'test/snap0' } as InstanceSnapshot;
const created = { name: 'test/snap1' } as InstanceSnapshot;

describe('ensureInstanceSnapshots', () => {
  test('a fenced fetch makes the hook refetch instead of staying on old data', async () => {
    const store = new IncusStore();
    const requests = new RequestRegistry();
    store.ensureInstance(key);

    // Mirror the resource hook: every write to the collection re-ensures.
    let pending: Promise<void> | undefined;
    store.subscribeKeys([collectionKey], () => {
      pending = ensureInstanceSnapshots(store, requests, request);
    });

    const settle = async () => {
      for (let round = 0; round < 10; round += 1) {
        const current = pending;
        if (!current) return;
        await current;
        if (pending === current) return;
      }
    };

    const invalidate = () => {
      store.update((draft) => {
        draft.instances.items[key].snapshots.collection = { status: 'stale' };
      }, [collectionKey]);
    };

    // 1) the list loads.
    state.collectionResponse = [fixture];
    state.onFetch = undefined;
    await ensureInstanceSnapshots(store, requests, request);
    await settle();
    expect(state.fetchCount).toBe(1);
    expect(
      store.getSnapshot().state.instances.items[key].snapshots.collection.status,
    ).toBe('ready');

    // 2) incusd announces the new snapshot while our refetch is in flight, so
    //    that refetch is fenced and has to be repeated.
    state.collectionResponse = [fixture, created];
    let invalidated = false;
    state.onFetch = () => {
      if (invalidated) return;
      invalidated = true;
      invalidate();
    };
    invalidate();
    await settle();

    const item = store.getSnapshot().state.instances.items[key];
    expect(item.snapshots.collection.status).toBe('ready');
    expect(Object.keys(item.snapshots.items).sort()).toEqual([
      'test/snap0',
      'test/snap1',
    ]);
  });
});
