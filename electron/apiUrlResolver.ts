/**
 * Resolves the Python backend base URL.
 * Priority: config.api.url → lock file discovery → default.
 * Extracted for testability.
 */

import fs from 'fs';
import path from 'path';
import type { AppConfig } from './types';

export interface ResolveOptions {
  projectRoot?: string;
  fs?: Pick<typeof import('fs'), 'existsSync' | 'readFileSync'>;
  pathMod?: Pick<typeof import('path'), 'resolve' | 'join' | 'basename'>;
}

export function resolveBaseUrl(config: AppConfig, options?: ResolveOptions): string {
  const fsMod = options?.fs ?? fs;
  const pathMod = options?.pathMod ?? path;
  const projectRoot = options?.projectRoot ?? pathMod.resolve(__dirname, '..');

  if (config.api?.url) {
    return config.api.url.replace(/\/$/, '');
  }

  let port = config.api?.port ?? 7860;
  const host = config.api?.host ?? '127.0.0.1';

  try {
    const projectsDir = pathMod.resolve(projectRoot, '..');
    const locks = [
      pathMod.join(projectsDir, 'image-scoring', 'webui.lock'),
      pathMod.join(projectsDir, 'image-scoring', 'webui-debug.lock'),
    ];
    for (const lockFile of locks) {
      if (fsMod.existsSync(lockFile)) {
        const content = fsMod.readFileSync(lockFile, 'utf8');
        const data = JSON.parse(content) as { port?: number };
        if (data?.port) {
          port = data.port;
          break;
        }
      }
    }
  } catch (e) {
    console.error('[apiUrlResolver] Lock file read error:', e);
  }

  return `http://${host}:${port}`;
}
