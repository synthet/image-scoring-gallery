import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NefViewer } from './nefViewer';
import { bridge } from '../bridge';

// Mock bridge
vi.mock('../bridge', () => ({
  bridge: {
    extractNefPreview: vi.fn(),
  },
}));

describe('NefViewer', () => {
  let nefViewer: NefViewer;

  beforeEach(() => {
    nefViewer = NefViewer.getInstance();
    // Ensure window.electron exists for the tests to enter the main logic
    (window as any).electron = {};
  });

  afterEach(() => {
    delete (window as any).electron;
    vi.clearAllMocks();
  });

  it('Tier 1: uses bridge.extractNefPreview successfully', async () => {
    const mockBuffer = new Uint8Array([1, 2, 3]);
    vi.mocked(bridge.extractNefPreview).mockResolvedValue({
      success: true,
      buffer: mockBuffer,
    });

    const result = await nefViewer.extractWithFallback('test.nef');

    expect(bridge.extractNefPreview).toHaveBeenCalledWith('test.nef');
    expect(result).toBeInstanceOf(Blob);
    expect(result?.type).toBe('image/jpeg');
    expect(result?.size).toBe(3);
  });

  it('Tier 2: extracts from SubIFD if Tier 1 returns fallback=true (Minimal TIFF Mock)', async () => {
    // Construct a minimal valid TIFF buffer for Tier 2 extraction
    const buffer = new Uint8Array(64);
    const view = new DataView(buffer.buffer);
    
    // TIFF Header (Little Endian "II")
    view.setUint8(0, 0x49); 
    view.setUint8(1, 0x49);
    view.setUint16(2, 42, true);
    view.setUint32(4, 8, true); // IFD0 at offset 8

    // IFD0 (8 bytes offset + 2 entries count + entries)
    view.setUint16(8, 1, true); // 1 entry
    // Entry 1: Tag 0x014a (SubIFDs), Type 4 (LONG), Count 1, Value 26 (Offset to SubIFD)
    view.setUint16(10, 0x014a, true);
    view.setUint16(12, 4, true);
    view.setUint32(14, 1, true);
    view.setUint32(18, 26, true); 

    // SubIFD0 at offset 26
    view.setUint16(26, 2, true); // 2 entries
    // Entry 1: Tag 0x0201 (JPEG Offset), Value 56
    view.setUint16(28, 0x0201, true);
    view.setUint16(30, 4, true);
    view.setUint32(32, 1, true);
    view.setUint32(36, 56, true);
    // Entry 2: Tag 0x0202 (JPEG Length), Value 4
    view.setUint16(40, 0x0202, true);
    view.setUint16(42, 4, true);
    view.setUint32(44, 1, true);
    view.setUint32(48, 4, true);

    // JPEG Data at offset 56: SOI + EOI
    view.setUint8(56, 0xFF);
    view.setUint8(57, 0xD8);
    view.setUint8(58, 0xFF);
    view.setUint8(59, 0xD9);

    vi.mocked(bridge.extractNefPreview).mockResolvedValue({
      success: false,
      fallback: true,
      buffer: buffer,
    });

    const result = await nefViewer.extractWithFallback('test-tier2.nef');
    expect(result).toBeInstanceOf(Blob);
    expect(result?.size).toBe(4);
  });

  it('Tier 3: extracts via marker scanning if SubIFD fails', async () => {
    // Buffer with a large JPEG (> 10KB to pass size filter) buried in noise
    const size = 12000;
    const buffer = new Uint8Array(size + 1000);
    const jpegOffset = 512;
    // Set SOI marker
    buffer[jpegOffset] = 0xFF;
    buffer[jpegOffset + 1] = 0xD8;
    // Set EOI marker at the end
    buffer[jpegOffset + size - 2] = 0xFF;
    buffer[jpegOffset + size - 1] = 0xD9;

    vi.mocked(bridge.extractNefPreview).mockResolvedValue({
      success: false,
      fallback: true,
      buffer: buffer,
    });

    const result = await nefViewer.extractWithFallback('test-tier3.nef');
    expect(result).toBeInstanceOf(Blob);
    expect(result?.size).toBe(size);
  });

  it('returns null if all tiers fail', async () => {
    vi.mocked(bridge.extractNefPreview).mockResolvedValue({
      success: false,
      fallback: true,
      buffer: new Uint8Array([0, 1, 2, 3]), // Garbage
    });

    const result = await nefViewer.extractWithFallback('fail.nef');
    expect(result).toBeNull();
  });

  it('returns null if no electron environment', async () => {
    delete (window as any).electron;
    const result = await nefViewer.extractWithFallback('no-electron.nef');
    expect(result).toBeNull();
  });
});
