import { describe, it, expect } from 'vitest';
import type { Folder } from '../components/Tree/treeUtils';
import { folderIdExistsInTree, readGalleryBrowserSnapshot } from './galleryBrowserPersistence';

describe('galleryBrowserPersistence', () => {
  it('folderIdExistsInTree finds nested ids', () => {
    const folders: Folder[] = [
      { id: 1, title: 'root', path: '/root', parent_id: null, is_fully_scored: 0, image_count: 0, children: [{ id: 2, title: 'leaf', path: '/root/leaf', parent_id: 1, is_fully_scored: 0, image_count: 0, children: [] }] },
    ];
    expect(folderIdExistsInTree(folders, 1)).toBe(true);
    expect(folderIdExistsInTree(folders, 2)).toBe(true);
    expect(folderIdExistsInTree(folders, 99)).toBe(false);
  });

  it('readGalleryBrowserSnapshot returns null without storage', () => {
    sessionStorage.clear();
    expect(readGalleryBrowserSnapshot()).toBeNull();
  });
});
