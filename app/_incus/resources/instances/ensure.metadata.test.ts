// Regression for the phantom instance row: opening an instance page seeds a
// store item for the requested key before fetching. When the metadata fetch
// answers "Instance not found", that placeholder must be removed again —
// otherwise a list row for an instance the daemon does not have showed up,
// and every action on it (delete, console) only produced 404s.
import { describe, expect, mock, test } from 'bun:test';
import { IncusStore } from '../../store';
import { RequestRegistry } from '../../requests';
import { instanceKey } from '../../keys';

const TRANSPORT_PATH = `${import.meta.dir}/../../transport`;

(globalThis as { window?: unknown }).window = { location: { origin: 'https://lxa.test' } };

const state = {
  failure: undefined as Error | undefined,
  fetchCount: 0,
};

mock.module(TRANSPORT_PATH, () => {
  return {
    requestJson: (async () => {
      state.fetchCount += 1;
      if (state.failure) throw state.failure;
      return {
        metadata: {
          name: 'test',
          type: 'container',
          status: 'Running',
          status_code: 103,
        },
      };
    }) as never,
    requestOperation: async () => ({}),
    requestIncusJson: async () => ({ metadata: {} }),
    requestText: async () => '',
  };
});

const ensureModule = await import(`${import.meta.dir}/ensure.ts`);
const { ensureInstances } = ensureModule;

describe('single-instance metadata ensure', () => {
  test('"Instance not found" removes the placeholder instead of keeping an error row', async () => {
    const store = new IncusStore();
    const requests = new RequestRegistry();
    const key = instanceKey('default', 'missing');
    state.failure = new Error('Instance not found');

    await ensureInstances(store, requests, 'default', {
      visibleKeys: [key],
      include: { metadata: true },
    });

    expect(store.getSnapshot().state.instances.items[key]).toBeUndefined();
  });

  test('other errors keep the item and surface an error status for retry/debug', async () => {
    const store = new IncusStore();
    const requests = new RequestRegistry();
    const key = instanceKey('default', 'broken');
    state.failure = new Error('connection refused');

    await ensureInstances(store, requests, 'default', {
      visibleKeys: [key],
      include: { metadata: true },
    });

    const item = store.getSnapshot().state.instances.items[key];
    expect(item).toBeDefined();
    expect(item?.metadata.status).toBe('error');
  });
});
