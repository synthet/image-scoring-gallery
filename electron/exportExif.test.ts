import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { BrowserWindow, SaveDialogOptions, SaveDialogReturnValue } from 'electron';
import type { ExportImageContext } from './types';
import type { ExifTool } from 'exiftool-vendored';
import { exportImageExif, type ExportExifDeps } from './exportExif';
import fs from 'fs';

describe('exportImageExif', () => {
    let mockMainWindow: BrowserWindow;
    let mockSend: ReturnType<typeof vi.fn>;
    let mockExiftool: { read: ReturnType<typeof vi.fn> };
    let mockShowSaveDialog: Mock<(options: SaveDialogOptions) => Promise<SaveDialogReturnValue>>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSend = vi.fn();
        mockMainWindow = {
            webContents: {
                send: mockSend,
            },
        } as unknown as BrowserWindow;

        mockExiftool = {
            read: vi.fn(),
        };

        mockShowSaveDialog = vi.fn();
    });

    it('returns error when no image is selected', async () => {
        const deps: ExportExifDeps = {
            getMainWindow: () => mockMainWindow,
            getExportContext: () => null,
            getSelectionPath: () => null,
            showSaveDialog: mockShowSaveDialog,
            exiftool: mockExiftool as unknown as ExifTool,
        };

        const result = await exportImageExif(deps);

        expect(result.success).toBe(false);
        expect(result.error).toBe('No image selected');
        expect(mockSend).toHaveBeenCalledWith(
            'show-notification',
            expect.objectContaining({ type: 'warning' }),
        );
        expect(mockShowSaveDialog).not.toHaveBeenCalled();
    });

    it('returns error when source file does not exist on disk', async () => {
        const fakePath = 'D:\\NonExistent\\fake_image.jpg';
        const deps: ExportExifDeps = {
            getMainWindow: () => mockMainWindow,
            getExportContext: () => null,
            getSelectionPath: () => fakePath,
            showSaveDialog: mockShowSaveDialog,
            exiftool: mockExiftool as unknown as ExifTool,
        };

        const result = await exportImageExif(deps);

        expect(result.success).toBe(false);
        expect(result.error).toContain('File not found');
        expect(mockSend).toHaveBeenCalledWith(
            'show-notification',
            expect.objectContaining({ type: 'error' }),
        );
    });

    it('returns cancelled when user dismisses save dialog', async () => {
        // Mock fs.existsSync to report true for our test source file
        const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);

        mockShowSaveDialog.mockResolvedValue({
            canceled: true,
            filePath: '',
        });

        const deps: ExportExifDeps = {
            getMainWindow: () => mockMainWindow,
            getExportContext: () => null,
            getSelectionPath: () => 'D:\\Photos\\test_bird.nef',
            showSaveDialog: mockShowSaveDialog,
            exiftool: mockExiftool as unknown as ExifTool,
        };

        const result = await exportImageExif(deps);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Export cancelled');
        expect(mockExiftool.read).not.toHaveBeenCalled();

        existsSpy.mockRestore();
    });

    it('exports metadata to JSON file', async () => {
        const sourcePath = 'D:\\Photos\\test_bird.nef';
        const savePath = 'D:\\Photos\\test_bird-exif.json';

        const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        const statSpy = vi.spyOn(fs.promises, 'stat').mockResolvedValue({
            size: 45000000,
            mtime: new Date('2026-05-03T10:00:00Z'),
        } as unknown as fs.Stats);
        const writeFileSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);

        mockShowSaveDialog.mockResolvedValue({
            canceled: false,
            filePath: savePath,
        });

        mockExiftool.read.mockResolvedValue({
            Make: 'Nikon',
            Model: 'NIKON Z 8',
            LensModel: 'NIKKOR Z 180-600mm f/5.6-6.3 VR',
            ExposureTime: '1/3200',
            FNumber: 6.3,
            ISO: 1600,
            FocalLength: '600.0 mm',
            WhiteBalance: 'Auto0',
            DateTimeOriginal: '2026:05:03 09:30:15',
        });

        const deps: ExportExifDeps = {
            getMainWindow: () => mockMainWindow,
            getExportContext: () => null,
            getSelectionPath: () => null,
            showSaveDialog: mockShowSaveDialog,
            exiftool: mockExiftool as unknown as ExifTool,
        };

        const result = await exportImageExif(deps, sourcePath);

        expect(result.success).toBe(true);
        expect(result.filePath).toBe(savePath);
        expect(mockExiftool.read).toHaveBeenCalledWith(
            expect.stringContaining('test_bird.nef'),
            expect.arrayContaining(['-a', '-u', '-U']),
        );
        expect(writeFileSpy).toHaveBeenCalledWith(
            savePath,
            expect.stringContaining('NIKON Z 8'),
            'utf-8',
        );

        const writtenJson = JSON.parse(writeFileSpy.mock.calls[0][1] as string);
        expect(writtenJson.summary.camera).toBe('Nikon NIKON Z 8');
        expect(writtenJson.summary.iso).toBe(1600);
        expect(writtenJson.tags.LensModel).toBe('NIKKOR Z 180-600mm f/5.6-6.3 VR');

        expect(mockSend).toHaveBeenCalledWith(
            'show-notification',
            expect.objectContaining({ type: 'success' }),
        );

        existsSpy.mockRestore();
        statSpy.mockRestore();
        writeFileSpy.mockRestore();
    });

    it('exports metadata to Markdown file when .md selected', async () => {
        const sourcePath = 'D:\\Photos\\test_bird.jpg';
        const savePath = 'D:\\Photos\\test_bird-exif.md';

        const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        const statSpy = vi.spyOn(fs.promises, 'stat').mockResolvedValue({
            size: 2500000,
            mtime: new Date('2026-05-03T10:00:00Z'),
        } as unknown as fs.Stats);
        const writeFileSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);

        mockShowSaveDialog.mockResolvedValue({
            canceled: false,
            filePath: savePath,
        });

        mockExiftool.read.mockResolvedValue({
            Make: 'Nikon',
            Model: 'NIKON Z 8',
            ExposureTime: '1/2000',
            FNumber: 5.6,
            ISO: 800,
        });

        const deps: ExportExifDeps = {
            getMainWindow: () => mockMainWindow,
            getExportContext: () => ({
                id: 1,
                imageUuid: 'test-uuid',
                fileName: 'test.nef',
                mimeType: 'image/x-nikon-nef',
                sourcePath,
                imageBytes: [1, 2, 3],
            } as ExportImageContext),
            getSelectionPath: () => null,
            showSaveDialog: mockShowSaveDialog,
            exiftool: mockExiftool as unknown as ExifTool,
        };

        const result = await exportImageExif(deps);

        expect(result.success).toBe(true);
        expect(result.filePath).toBe(savePath);

        const writtenMd = writeFileSpy.mock.calls[0][1] as string;
        expect(writtenMd).toContain('# EXIF Metadata Export: test_bird.jpg');
        expect(writtenMd).toContain('- **Camera:** Nikon NIKON Z 8');
        expect(writtenMd).toContain('- **ISO:** 800');

        existsSpy.mockRestore();
        statSpy.mockRestore();
        writeFileSpy.mockRestore();
    });

    it('handles exiftool extraction error gracefully', async () => {
        const sourcePath = 'D:\\Photos\\corrupted.nef';
        const savePath = 'D:\\Photos\\corrupted-exif.json';

        const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        mockShowSaveDialog.mockResolvedValue({
            canceled: false,
            filePath: savePath,
        });

        mockExiftool.read.mockRejectedValue(new Error('Corrupt metadata in raw header'));

        const deps: ExportExifDeps = {
            getMainWindow: () => mockMainWindow,
            getExportContext: () => null,
            getSelectionPath: () => sourcePath,
            showSaveDialog: mockShowSaveDialog,
            exiftool: mockExiftool as unknown as ExifTool,
        };

        const result = await exportImageExif(deps);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Corrupt metadata');
        expect(mockSend).toHaveBeenCalledWith(
            'show-notification',
            expect.objectContaining({ type: 'error', message: expect.stringContaining('Corrupt metadata') }),
        );

        existsSpy.mockRestore();
    });
});
