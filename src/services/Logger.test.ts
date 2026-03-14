import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from './Logger';

type TestWindow = Window & typeof globalThis & {
  electron?: {
    log: ReturnType<typeof vi.fn>;
  };
};

describe('Logger', () => {
  let logMock: ReturnType<typeof vi.fn>;
  const testWindow = globalThis.window as TestWindow;

  beforeEach(() => {
    logMock = vi.fn().mockResolvedValue(undefined);
    testWindow.electron = {
      log: logMock,
    };
  });

  afterEach(() => {
    delete testWindow.electron;
  });

  it('calls window.electron.log with INFO for info()', () => {
    Logger.info('test message');
    expect(logMock).toHaveBeenCalledWith('INFO', 'test message', undefined);
  });

  it('calls window.electron.log with INFO and data for info()', () => {
    const data = { foo: 'bar' };
    Logger.info('msg', data);
    expect(logMock).toHaveBeenCalledWith('INFO', 'msg', data);
  });

  it('calls window.electron.log with ERROR for error()', () => {
    Logger.error('error message');
    expect(logMock).toHaveBeenCalledWith('ERROR', 'error message', undefined);
  });

  it('calls window.electron.log with WARN for warn()', () => {
    Logger.warn('warn message');
    expect(logMock).toHaveBeenCalledWith('WARN', 'warn message', undefined);
  });

  it('calls window.electron.log with DEBUG for debug()', () => {
    Logger.debug('debug message');
    expect(logMock).toHaveBeenCalledWith('DEBUG', 'debug message', undefined);
  });

  it('does not throw when window.electron is absent', () => {
    vi.unstubAllGlobals();
    const orig = testWindow.electron;
    delete testWindow.electron;
    expect(() => Logger.info('no electron')).not.toThrow();
    testWindow.electron = orig;
  });

  it('handles log error from backend', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logMock.mockRejectedValueOnce(new Error('Backend error'));

    Logger.error('test error');

    // Wait for promise to resolve
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(consoleSpy).toHaveBeenCalledWith('Failed to send log to backend', expect.anything());
    consoleSpy.mockRestore();
  });
});
