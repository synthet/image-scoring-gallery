import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useOperationStore } from './useOperationStore';

vi.mock('../services/Logger', () => ({
  Logger: {
    info: vi.fn(),
  },
}));

describe('useOperationStore', () => {
  beforeEach(() => {
    useOperationStore.setState({ activeOps: new Map() });
  });

  it('starts with no active operations', () => {
    expect(useOperationStore.getState().activeOps.size).toBe(0);
  });

  it('startOp registers type, label, and startedAt', () => {
    useOperationStore.getState().startOp('op-1', 'sync', 'Backing up');
    const op = useOperationStore.getState().activeOps.get('op-1');
    expect(op).toBeDefined();
    expect(op).toMatchObject({ type: 'sync', label: 'Backing up' });
    expect(op?.startedAt).toBeGreaterThan(0);
  });

  it('updateOp merges current and total when the id exists', () => {
    useOperationStore.getState().startOp('op-1', 'import', 'Import');
    useOperationStore.getState().updateOp('op-1', { current: 2, total: 5, label: 'Import (2/5)' });
    expect(useOperationStore.getState().activeOps.get('op-1')).toMatchObject({
      current: 2,
      total: 5,
      label: 'Import (2/5)',
    });
  });

  it('updateOp is a no-op when the id is unknown', () => {
    useOperationStore.getState().startOp('only', 'sync', 'S');
    const snapshot = new Map(useOperationStore.getState().activeOps);
    useOperationStore.getState().updateOp('missing', { current: 99 });
    expect(useOperationStore.getState().activeOps).toEqual(snapshot);
  });

  it('completeOp removes the operation', () => {
    useOperationStore.getState().startOp('op-1', 'sync', 'S');
    useOperationStore.getState().completeOp('op-1');
    expect(useOperationStore.getState().activeOps.size).toBe(0);
  });

  it('completeOp is a no-op when the id is unknown', () => {
    useOperationStore.getState().startOp('op-1', 'sync', 'S');
    useOperationStore.getState().completeOp('ghost');
    expect(useOperationStore.getState().activeOps.size).toBe(1);
  });

  it('keeps multiple operations independent', () => {
    useOperationStore.getState().startOp('a', 'sync', 'A');
    useOperationStore.getState().startOp('b', 'import', 'B');
    useOperationStore.getState().completeOp('a');
    const ops = useOperationStore.getState().activeOps;
    expect(ops.size).toBe(1);
    expect(ops.has('b')).toBe(true);
  });
});
