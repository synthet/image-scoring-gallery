import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useNotificationStore } from './useNotificationStore';

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.getState().clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no notifications', () => {
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('addNotification adds a notification with default type "info"', () => {
    useNotificationStore.getState().addNotification('Hello');
    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toBe('Hello');
    expect(notifications[0].type).toBe('info');
    expect(notifications[0].id).toBeTruthy();
    expect(notifications[0].timestamp).toBeGreaterThan(0);
  });

  it('addNotification accepts an explicit type', () => {
    useNotificationStore.getState().addNotification('Error occurred', 'error');
    const { notifications } = useNotificationStore.getState();
    expect(notifications[0].type).toBe('error');
  });

  it('addNotification prepends: newest is first', () => {
    useNotificationStore.getState().addNotification('first');
    useNotificationStore.getState().addNotification('second');
    const { notifications } = useNotificationStore.getState();
    expect(notifications[0].message).toBe('second');
    expect(notifications[1].message).toBe('first');
  });

  it('keeps at most 5 notifications', () => {
    for (let i = 0; i < 7; i++) {
      useNotificationStore.getState().addNotification(`msg ${i}`);
    }
    expect(useNotificationStore.getState().notifications).toHaveLength(5);
  });

  it('removeNotification removes the correct notification', () => {
    useNotificationStore.getState().addNotification('A');
    useNotificationStore.getState().addNotification('B');
    const id = useNotificationStore.getState().notifications[0].id; // 'B' (newest first)
    useNotificationStore.getState().removeNotification(id);
    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toBe('A');
  });

  it('removeNotification with unknown id leaves notifications unchanged', () => {
    useNotificationStore.getState().addNotification('keep me');
    useNotificationStore.getState().removeNotification('nonexistent-id');
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it('clearAll removes all notifications', () => {
    useNotificationStore.getState().addNotification('one');
    useNotificationStore.getState().addNotification('two');
    useNotificationStore.getState().clearAll();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('auto-removes notification after 5 seconds', () => {
    vi.useFakeTimers();
    useNotificationStore.getState().addNotification('temporary');
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    vi.advanceTimersByTime(5000);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('does not auto-remove before 5 seconds', () => {
    vi.useFakeTimers();
    useNotificationStore.getState().addNotification('still here');
    vi.advanceTimersByTime(4999);
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it('supports all notification types', () => {
    const types = ['info', 'success', 'warning', 'error'] as const;
    for (const type of types) {
      useNotificationStore.getState().addNotification(`msg-${type}`, type);
    }
    const { notifications } = useNotificationStore.getState();
    const seen = notifications.map(n => n.type);
    for (const type of types) {
      expect(seen).toContain(type);
    }
  });
});
