import { useState, useMemo, type MutableRefObject } from 'react';
import type { Folder } from '../components/Tree/treeUtils';

/**
 * Manages folder selection, subfolder toggle, breadcrumb computation,
 * and parent navigation for the gallery view.
 */
export function useGalleryNavigation(
  folders: Folder[],
  activeStackIdRef: MutableRefObject<number | null>,
  onClearStack: () => void,
) {
  const [selectedFolderId, setSelectedFolderId] = useState<number | undefined>(undefined);
  const [includeSubfolders, setIncludeSubfolders] = useState(false);

  const currentFolder = useMemo(() => {
    if (!selectedFolderId) return null;
    const find = (nodes: Folder[]): Folder | undefined => {
      for (const node of nodes) {
        if (node.id === selectedFolderId) return node;
        if (node.children) {
          const found = find(node.children);
          if (found) return found;
        }
      }
    };
    return find(folders) ?? null;
  }, [folders, selectedFolderId]);

  const subfolderIds = useMemo(() => {
    if (!includeSubfolders || !currentFolder?.children?.length) return undefined;
    const collectIds = (folder: Folder): number[] => {
      const ids = [folder.id];
      if (folder.children) {
        for (const child of folder.children) {
          ids.push(...collectIds(child));
        }
      }
      return ids;
    };
    return collectIds(currentFolder);
  }, [includeSubfolders, currentFolder]);

  const handleSelectFolder = (folder: Folder) => {
    setSelectedFolderId(folder.id);
    setIncludeSubfolders(false);
    onClearStack();
  };

  const handleNavigateToParent = () => {
    if (activeStackIdRef.current !== null) {
      onClearStack();
      return;
    }

    if (!selectedFolderId) return;

    const findParent = (nodes: Folder[], targetId: number, parentId?: number): number | undefined => {
      for (const node of nodes) {
        if (node.id === targetId) return parentId;
        if (node.children) {
          const result = findParent(node.children, targetId, node.id);
          if (result !== undefined) return result;
        }
      }
      return undefined;
    };

    const parentId = findParent(folders, selectedFolderId);
    setSelectedFolderId(parentId);
  };

  return {
    selectedFolderId,
    setSelectedFolderId,
    includeSubfolders,
    setIncludeSubfolders,
    currentFolder,
    subfolderIds,
    handleSelectFolder,
    handleNavigateToParent,
  };
}
