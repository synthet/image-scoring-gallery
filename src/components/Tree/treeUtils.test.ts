import { describe, it, expect } from 'vitest';
import { buildFolderTree, type Folder } from './treeUtils';

interface FolderRow {
  id: number;
  path: string;
  parent_id: number | null;
  is_fully_scored: number;
  image_count: number;
}

function row(
  id: number,
  path: string,
  parent_id: number | null,
  image_count = 0
): FolderRow {
  return { id, path, parent_id, is_fully_scored: 0, image_count };
}

describe('buildFolderTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildFolderTree([])).toEqual([]);
  });

  it('returns single root for one folder with parent_id null', () => {
    const folders = [row(1, '/photos', null, 5)];
    const result = buildFolderTree(folders);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 1,
      path: '/photos',
      title: 'photos',
      image_count: 5,
      total_image_count: 5,
    });
    expect(result[0].children).toEqual([]);
  });

  it('builds nested hierarchy with parent/child', () => {
    const folders = [
      row(1, '/photos', null, 0),
      row(2, '/photos/2024', 1, 3),
      row(3, '/photos/2023', 1, 2),
    ];
    const result = buildFolderTree(folders);
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(2);
    expect(result[0].total_image_count).toBe(5);
    const titles = (result[0].children as Folder[]).map((c) => c.title);
    expect(titles).toContain('2024');
    expect(titles).toContain('2023');
  });

  it('sorts children by title (localeCompare)', () => {
    const folders = [
      row(1, '/root', null, 0),
      row(2, '/root/zebra', 1, 1),
      row(3, '/root/alpha', 1, 1),
      row(4, '/root/middle', 1, 1),
    ];
    const result = buildFolderTree(folders);
    const children = result[0].children as Folder[];
    expect(children.map((c) => c.title)).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('computes total_image_count recursively', () => {
    const folders = [
      row(1, '/root', null, 1),
      row(2, '/root/a', 1, 2),
      row(3, '/root/a/x', 2, 3),
    ];
    const result = buildFolderTree(folders);
    expect(result[0].total_image_count).toBe(6); // 1 + 2 + 3
    const childA = result[0].children![0];
    expect(childA.total_image_count).toBe(5); // 2 + 3
    expect(childA.children![0].total_image_count).toBe(3);
  });

  it('skips folders with path ending in .', () => {
    const folders = [
      row(1, '/foo/.', null, 1),
      row(2, '/foo/bar', null, 2),
    ];
    const result = buildFolderTree(folders);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
    expect(result[0].path).toBe('/foo/bar');
  });

  it('parses Windows path and yields correct title', () => {
    const folders = [row(1, 'C:\\Users\\Photos\\vacation', null, 1)];
    const result = buildFolderTree(folders);
    expect(result[0].title).toBe('vacation');
  });

  it('parses Unix path and yields correct title', () => {
    const folders = [row(1, '/home/user/photos/vacation', null, 1)];
    const result = buildFolderTree(folders);
    expect(result[0].title).toBe('vacation');
  });

  it('handles empty path with Unknown title', () => {
    const folders = [row(1, '', null, 1)];
    const result = buildFolderTree(folders);
    expect(result[0].title).toBe('Unknown');
  });

  it('nests under path parent when DB parent_id row is missing', () => {
    const folders = [
      row(1, '/photos', null, 1),
      row(2, '/photos/2024', 999, 2),
    ];
    const result = buildFolderTree(folders);
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].id).toBe(2);
    expect(result[0].total_image_count).toBe(3);
  });
});
