'use client';

import React from 'react';
import { useIncusClient } from '../../../provider';
import {
  deriveResourceStatus,
  resourceStatusFlags,
} from '../../../status';
import type { InstanceSnapshot } from '../../../types';
import { useIncusResourceSnapshot } from '../../../use-resource-snapshot';
import { snapshotIdentity } from './ensure';

export function useInstanceSnapshots(
  instanceName: string,
  project?: string | null,
) {
  const client = useIncusClient();
  const { key, collectionKey } = snapshotIdentity({ instanceName, project });
  const { storeSnapshot: snapshot, hasInFlight } = useIncusResourceSnapshot(
    client,
    [collectionKey],
  );
  const item = snapshot.state.instances.items[key];
  const collection = item?.snapshots.collection ?? { status: 'missing' as const };
  const snapshots = Object.values(item?.snapshots.items ?? {})
    .map((snapshot) => snapshot.metadata.data)
    .filter((snapshot): snapshot is InstanceSnapshot => Boolean(snapshot))
    .sort((a, b) => a.name.localeCompare(b.name));

  React.useEffect(() => {
    void client.instanceSnapshots.ensure({ instanceName, project });
    // Re-ensure on every collection-status flip ('stale'/'missing'/'error') so
    // event-driven invalidations actually refetch instead of staying stale.
  }, [client, instanceName, project, collection.status]);

  const status = deriveResourceStatus({
    storedStatus: collection.status,
    hasData: snapshots.length > 0,
    inFlight: hasInFlight(collectionKey),
  });
  const flags = resourceStatusFlags(status);

  return {
    snapshots,
    status,
    isLoading: flags.isLoading,
    isStale: flags.isStale,
    isRefreshing: flags.isRefreshing,
    isError:
      collection.status === 'error'
        ? new Error(collection.error ?? 'Unable to load instance snapshots.')
        : null,
  };
}
