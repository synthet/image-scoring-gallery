import { useState, useCallback, useEffect, useRef } from 'react';
import type { FilterState } from '../components/Sidebar/FilterPanel';

interface ImageRow {
  id: number;
  file_path: string;
  file_name: string;
  score_general: number;
  score_technical?: number;
  score_aesthetic?: number;
  score_spaq?: number;
  score_ava?: number;
  score_liqe?: number;
  rating: number;
  label: string | null;
  created_at?: string;
  thumbnail_path?: string;
  stack_id?: number | null;
  stack_key?: number;
  image_count?: number;
  sort_value?: number;
}

/**
 * Manages stacks mode: toggling stacks view, opening individual stacks,
 * loading stack images, and rebuilding the stack cache on first enable.
 */
export function useStacksMode(
  selectedFolderId: number | undefined,
  filters: FilterState,
  refreshStacks: (opts?: { preserveItems?: boolean }) => void,
) {
  const [stacksMode, setStacksMode] = useState(false);
  const [activeStackId, setActiveStackId] = useState<number | null>(null);
  const [activeStackInfo, setActiveStackInfo] = useState<{ stackId: number; imageCount: number } | null>(null);
  const [cacheBuilt, setCacheBuilt] = useState(false);
  const [stackImages, setStackImages] = useState<ImageRow[]>([]);
  const [stackImagesLoading, setStackImagesLoading] = useState(false);

  const loadStackImages = useCallback(async (stackId: number) => {
    if (!window.electron) return;
    setStackImagesLoading(true);
    try {
      const options = { folderId: selectedFolderId, ...filters };
      const imgs = await window.electron.getImagesByStack(stackId, options);
      setStackImages(imgs);
    } catch (err) {
      console.error('Failed to load stack images', err);
    } finally {
      setStackImagesLoading(false);
    }
  }, [selectedFolderId, filters]);

  const loadStackImagesRef = useRef(loadStackImages);
  loadStackImagesRef.current = loadStackImages;

  // Reload stack images when activeStackId or filters change
  useEffect(() => {
    if (activeStackId !== null) {
      loadStackImages(activeStackId);
    }
  }, [activeStackId, loadStackImages]);

  // Rebuild stack cache when stacks mode is first enabled
  useEffect(() => {
    if (stacksMode && !cacheBuilt && window.electron) {
      window.electron.rebuildStackCache().then((result) => {
        console.log('[App] Stack cache rebuild result:', result);
        setCacheBuilt(true);
        refreshStacks();
      }).catch(err => {
        console.error('[App] Failed to rebuild stack cache:', err);
      });
    }
  }, [stacksMode, cacheBuilt, refreshStacks]);

  const clearStack = () => {
    setActiveStackId(null);
    setActiveStackInfo(null);
    setStackImages([]);
  };

  const enableStacksMode = (enabled: boolean) => {
    setStacksMode(enabled);
    clearStack();
  };

  const handleSelectStack = (stack: ImageRow & { stack_id?: number | null; image_count?: number }, fallbackImageClick: (img: ImageRow) => void) => {
    if (stack.stack_id !== null && stack.stack_id !== undefined) {
      setActiveStackId(stack.stack_id);
      setActiveStackInfo({ stackId: stack.stack_id, imageCount: stack.image_count || 0 });
      void loadStackImages(stack.stack_id);
    } else {
      fallbackImageClick(stack);
    }
  };

  const handleImageDeleteFromStack = (id: number) => {
    setStackImages(prev => prev.filter(img => img.id !== id));
    if (activeStackInfo) {
      setActiveStackInfo(prev => prev ? ({ ...prev, imageCount: Math.max(0, prev.imageCount - 1) }) : null);
    }
  };

  return {
    stacksMode,
    setStacksMode,
    enableStacksMode,
    activeStackId,
    setActiveStackId,
    activeStackInfo,
    setActiveStackInfo,
    cacheBuilt,
    stackImages,
    setStackImages,
    stackImagesLoading,
    loadStackImages,
    loadStackImagesRef,
    clearStack,
    handleSelectStack,
    handleImageDeleteFromStack,
  };
}
