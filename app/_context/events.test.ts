import { describe, expect, test } from 'bun:test';

import { isOperationOnViewedResource } from './events';

function makeOperation(
  resources: Record<string, string[]>,
  // Incus creates console connections as class "websocket" operations.
  // Everything else on an instance (snapshots, state changes, file uploads,
  // ...) is class "task" and carries the same instance resource path.
  opClass = 'task',
) {
  return {
    id: 'op-1',
    class: opClass,
    description: 'Operation',
    created_at: '',
    updated_at: '',
    status: 'Running',
    status_code: 100,
    resources,
    metadata: null,
    may_cancel: true,
    err: '',
    location: 'none',
  };
}

describe('isOperationOnViewedResource', () => {
  test('suppresses toast for console operation on viewed instance', () => {
    const op = makeOperation({ instance: ['/1.0/instances/c1'] }, 'websocket');
    expect(isOperationOnViewedResource(op, '/instance/console', 'c1')).toBe(true);
  });

  test('suppresses with Next.js basePath /ui prefix (production pathname)', () => {
    const op = makeOperation({ instance: ['/1.0/instances/c1'] }, 'websocket');
    expect(isOperationOnViewedResource(op, '/ui/instance/console', 'c1')).toBe(true);
  });

  test('basePath strip does not match unrelated prefixes', () => {
    const op = makeOperation({ instance: ['/1.0/instances/c1'] }, 'websocket');
    expect(isOperationOnViewedResource(op, '/uix/instance/console', 'c1')).toBe(false);
  });

  test('suppresses for console/window popup page', () => {
    const op = makeOperation({ instance: ['/1.0/instances/c1'] }, 'websocket');
    expect(isOperationOnViewedResource(op, '/instance/console/window', 'c1')).toBe(true);
  });

  test('suppresses for resource path with query params', () => {
    const op = makeOperation(
      { instances: ['/1.0/instances/c1?project=default'] },
      'websocket',
    );
    expect(isOperationOnViewedResource(op, '/instance/console', 'c1')).toBe(true);
  });

  test('does NOT suppress a console operation for a different instance', () => {
    const op = makeOperation({ instance: ['/1.0/instances/c2'] }, 'websocket');
    expect(isOperationOnViewedResource(op, '/instance/console', 'c1')).toBe(false);
  });

  test('does NOT suppress other instance operations while console is open', () => {
    // Snapshots, state changes and file uploads on the viewed instance carry
    // the same instance resource path as the console connection — only their
    // operation class differs, and they must keep notifying.
    for (const resources of [
      { instance: ['/1.0/instances/c1'] },
      { instance: ['/1.0/instances/c1/files'] },
      { instance: ['/1.0/instances/c1/snapshots/snap0'] },
    ]) {
      const op = makeOperation(resources, 'task');
      expect(
        isOperationOnViewedResource(op, '/instance/console', 'c1'),
      ).toBe(false);
    }
  });

  test('does NOT suppress on the dashboard page', () => {
    const op = makeOperation({ instance: ['/1.0/instances/c1'] }, 'websocket');
    expect(isOperationOnViewedResource(op, '/instance/dashboard', 'c1')).toBe(false);
  });

  test('does NOT suppress when no instance name in query', () => {
    const op = makeOperation({ instance: ['/1.0/instances/c1'] }, 'websocket');
    expect(isOperationOnViewedResource(op, '/instance/console', null)).toBe(false);
  });

  test('does NOT suppress when operation has no instance resources', () => {
    const op = makeOperation({ network: ['/1.0/networks/lan'] }, 'websocket');
    expect(isOperationOnViewedResource(op, '/instance/console', 'c1')).toBe(false);
  });

  test('does NOT suppress for empty resources', () => {
    const op = makeOperation({}, 'websocket');
    expect(isOperationOnViewedResource(op, '/instance/console', 'c1')).toBe(false);
  });

  test('handles URL-encoded instance names in resource paths', () => {
    const op = makeOperation({ instance: ['/1.0/instances/my%20instance'] }, 'websocket');
    expect(isOperationOnViewedResource(op, '/instance/console', 'my instance')).toBe(
      true,
    );
  });
});
