import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NefViewer } from './nefViewer';
import { bridge } from '../bridge';
import { bakeExifOrientationToBlob } from './exportImageBake';

vi.mock('./exportImageBake', () => ({ bakeExifOrientationToBlob: vi.fn() }));

// Mock bridge
vi.mock('../bridge', () => ({
  bridge: {
    extractNefPreview: vi.fn(),
  },
}));

describe('NefViewer', () => {
  let nefViewer: NefViewer;
  type WindowWithOptionalElectron = Window & { electron?: object };

  function setElectron(value: object | undefined) {
    (window as WindowWithOptionalElectron).electron = value;
  }

  beforeEach(() => {
    nefViewer = NefViewer.getInstance();
    // Ensure window.electron exists for the tests to enter the main logic
    setElectron({});
    vi.mocked(bakeExifOrientationToBlob).mockReset();
  });

  afterEach(() => {
    setElectron(undefined);
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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

  it('browser: fetches /media then Tier 2 SubIFD parse', async () => {
    setElectron(undefined);
    const buffer = new Uint8Array(64);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, 0x49);
    view.setUint8(1, 0x49);
    view.setUint16(2, 42, true);
    view.setUint32(4, 8, true);
    view.setUint16(8, 1, true);
    view.setUint16(10, 0x014a, true);
    view.setUint16(12, 4, true);
    view.setUint32(14, 1, true);
    view.setUint32(18, 26, true);
    view.setUint16(26, 2, true);
    view.setUint16(28, 0x0201, true);
    view.setUint16(30, 4, true);
    view.setUint32(32, 1, true);
    view.setUint32(36, 56, true);
    view.setUint16(40, 0x0202, true);
    view.setUint16(42, 4, true);
    view.setUint32(44, 1, true);
    view.setUint32(48, 4, true);
    view.setUint8(56, 0xff);
    view.setUint8(57, 0xd8);
    view.setUint8(58, 0xff);
    view.setUint8(59, 0xd9);

    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => ab,
      }),
    );

    const result = await nefViewer.extractWithFallback('/mnt/d/Photos/test.nef');
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Blob);
    vi.unstubAllGlobals();
  });

  it('browser: returns null when /media fetch is not ok', async () => {
    setElectron(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    );
    const result = await nefViewer.extractWithFallback('/mnt/x.nef');
    expect(result).toBeNull();
    vi.unstubAllGlobals();
  });

  it.each([true, false])('browser: retains source TIFF orientation in client preview (little endian=%s)', async (littleEndian) => {
    setElectron(undefined);
    const buffer = new ArrayBuffer(96);
    const view = new DataView(buffer);
    view.setUint16(0, littleEndian ? 0x4949 : 0x4d4d);
    view.setUint16(2, 42, littleEndian);
    view.setUint32(4, 8, littleEndian);
    view.setUint16(8, 2, littleEndian);
    view.setUint16(10, 0x0112, littleEndian);
    view.setUint16(12, 3, littleEndian);
    view.setUint32(14, 1, littleEndian);
    view.setUint16(18, 8, littleEndian);
    view.setUint16(22, 0x014a, littleEndian);
    view.setUint16(24, 4, littleEndian);
    view.setUint32(26, 1, littleEndian);
    view.setUint32(30, 38, littleEndian);
    view.setUint16(38, 2, littleEndian);
    view.setUint16(40, 0x0201, littleEndian);
    view.setUint32(48, 78, littleEndian);
    view.setUint16(52, 0x0202, littleEndian);
    view.setUint32(60, 4, littleEndian);
    new Uint8Array(buffer).set([0xff, 0xd8, 0xff, 0xd9], 78);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => buffer }));
    const upright = new Blob(['upright'], { type: 'image/jpeg' });
    vi.mocked(bakeExifOrientationToBlob).mockResolvedValue({
      blob: upright, width: 100, height: 200, sourceOrientation: 8, didNormalize: true,
    });

    const result = await nefViewer.extractWithFallback('/mnt/d/Photos/portrait.nef');

    expect(bakeExifOrientationToBlob).toHaveBeenCalledWith(expect.any(Blob), 'image/jpeg', 8);
    expect(result).toBe(upright);
  });
});
