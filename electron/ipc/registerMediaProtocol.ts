import fs from 'fs';
import path from 'path';
import isDev from 'electron-is-dev';
import { net, protocol } from 'electron';
import { pathToFileURL } from 'url';
import { parseMediaUrlToFilePath } from '../mediaUrlParse';
import { absolutizeThumbnailPath } from '../thumbnailPathNormalize';
import type { AppConfig } from '../types';
import { debugGalleryMedia, resolveMediaFilePathWithFallbacks } from '../fsMetadataHelpers';

export type MediaProtocolDeps = {
    electronDirname: string;
    config: AppConfig;
};

let mediaMissingLogCount = 0;
const MEDIA_MISSING_LOG_MAX = 12;

export function registerMediaScheme(): void {
    protocol.registerSchemesAsPrivileged([
        { scheme: 'media', privileges: { secure: true, supportFetchAPI: true, standard: true, bypassCSP: true } },
    ]);
}

export function registerMediaProtocol(deps: MediaProtocolDeps): void {
    const { electronDirname, config } = deps;

    protocol.handle('media', (request) => {
        if (debugGalleryMedia()) {
            console.log('[Main] Media request:', request.url);
        }
        try {
            let filePath: string;
            try {
                filePath = parseMediaUrlToFilePath(request.url);
            } catch {
                return new Response('Invalid encoding', { status: 400 });
            }

            if (process.platform === 'win32' && /^[a-zA-Z]\//.test(filePath) && !filePath.includes(':')) {
                const reconstructed = filePath[0] + ':' + filePath.slice(1);
                if (path.isAbsolute(reconstructed)) {
                    filePath = reconstructed;
                }
            }

            if (filePath.match(/^\/?mnt\/[a-zA-Z]\//)) {
                filePath = filePath.replace(/^\/?mnt\/([a-zA-Z])\//, '$1:/');
            }

            if (process.platform === 'win32' && /^\/[a-zA-Z]:\//.test(filePath)) {
                filePath = filePath.slice(1);
            }

            const projectRoot = path.resolve(electronDirname, '..');
            filePath = absolutizeThumbnailPath(filePath, projectRoot, config?.paths?.thumbnail_base_dir);

            if (!path.isAbsolute(filePath)) {
                console.error('[Main] Media blocked (non-absolute path after parse):', filePath, '| url=', request.url);
                return new Response('Access denied', { status: 403 });
            }

            const resolvedPath = path.resolve(filePath);
            const normalizedPath = path.normalize(resolvedPath);

            const mediaPath = resolveMediaFilePathWithFallbacks(normalizedPath);
            if (mediaPath !== normalizedPath && fs.existsSync(mediaPath)) {
                if (isDev || debugGalleryMedia()) {
                    console.log('[Main] Media path fallback:', normalizedPath, '->', mediaPath);
                }
            }

            if (!fs.existsSync(mediaPath)) {
                if (mediaMissingLogCount < MEDIA_MISSING_LOG_MAX) {
                    console.warn(
                        '[Main] Media file missing:',
                        mediaPath,
                        '| requested URL:',
                        request.url,
                        normalizedPath !== mediaPath ? `(tried flat: ${normalizedPath})` : '',
                    );
                    mediaMissingLogCount += 1;
                } else if (mediaMissingLogCount === MEDIA_MISSING_LOG_MAX) {
                    console.warn(
                        '[Main] Media file missing: further messages suppressed (set DEBUG_GALLERY_MEDIA=1 for per-request logs).',
                    );
                    mediaMissingLogCount += 1;
                }
            }

            const fileUrl = pathToFileURL(mediaPath).href;
            return net.fetch(fileUrl);
        } catch (e) {
            console.error('[Main] Invalid media path:', request.url, e);
            return new Response('Invalid path', { status: 400 });
        }
    });
}
