import { useState, useCallback, useEffect, useRef } from 'react';
import type { FilterState } from '../components/Sidebar/FilterPanel';
import { bridge } from '../bridge';

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
  sub_stack_id?: number | null;
  sub_stack_key?: number;
  name?: string | null;
  image_count?: number;
  sort_value?: number;
  is_ungrouped_sub_stack?: boolean;
}

interface StackInfo {
  stackId: number;
  imageCount: number;
}

interface SubStackInfo {
  subStackId: number | null;
  imageCount: number;
  name?: string | null;
}

/**
 * Manages stacks mode: toggling stacks view, opening individual stacks,
 * loading stack images, and rebuilding the stack cache on first enable.
 */
export function useStacksMode(
  _selectedFolderId: number | undefined,
  filters: FilterState,
  refreshStacks: (opts?: { preserveItems?: boolean }) => void,
  smartCoverEnabled: boolean,
) {
  const [stacksMode, setStacksMode] = useState(false);
  const [activeStackId, setActiveStackId] = useState<number | null>(null);
  const [activeStackInfo, setActiveStackInfo] = useState<StackInfo | null>(null);
  const [activeSubStackId, setActiveSubStackId] = useState<number | null>(null);
  const [activeUngroupedSubStack, setActiveUngroupedSubStack] = useState(false);
  const [activeSubStackInfo, setActiveSubStackInfo] = useState<SubStackInfo | null>(null);
  const [cacheBuilt, setCacheBuilt] = useState(false);
  const [subStacks, setSubStacks] = useState<ImageRow[]>([]);
  const [subStacksLoading, setSubStacksLoading] = useState(false);
  const [stackImages, setStackImages] = useState<ImageRow[]>([]);
  const [stackImagesLoading, setStackImagesLoading] = useState(false);
  const [subStackImages, setSubStackImages] = useState<ImageRow[]>([]);
  const [subStackImagesLoading, setSubStackImagesLoading] = useState(false);

  const loadStackImages = useCallback(async (stackId: number) => {
    setStackImagesLoading(true);
    try {
      const options = { ...filters };
      const imgs = await bridge.getImagesByStack(stackId, options);
      setStackImages(imgs);
    } catch (err) {
      console.error('Failed to load stack images', err);
    } finally {
      setStackImagesLoading(false);
    }
  }, [filters]);

  const loadStackImagesRef = useRef(loadStackImages);
  loadStackImagesRef.current = loadStackImages;

  const loadSubStackImages = useCallback(async (subStackId: number) => {
    setSubStackImagesLoading(true);
    try {
      const imgs = await bridge.getImagesBySubStack(subStackId, { ...filters });
      setSubStackImages(imgs);
    } catch (err) {
      console.error('Failed to load sub-stack images', err);
    } finally {
      setSubStackImagesLoading(false);
    }
  }, [filters]);

  const loadSubStackImagesRef = useRef(loadSubStackImages);
  loadSubStackImagesRef.current = loadSubStackImages;

  const loadUngroupedSubStackImages = useCallback(async (stackId: number) => {
    setSubStackImagesLoading(true);
    try {
      const imgs = await bridge.getImagesByStackUngrouped(stackId, { ...filters });
      setSubStackImages(imgs);
    } catch (err) {
      console.error('Failed to load ungrouped stack images', err);
    } finally {
      setSubStackImagesLoading(false);
    }
  }, [filters]);

  const loadUngroupedSubStackImagesRef = useRef(loadUngroupedSubStackImages);
  loadUngroupedSubStackImagesRef.current = loadUngroupedSubStackImages;

  const loadStackLanding = useCallback(async (stackId: number) => {
    setSubStacksLoading(true);
    setSubStacks([]);
    setStackImages([]);
    try {
      const subs = await bridge.getSubstacksForStack(stackId, { ...filters });
      setSubStacks(subs);
      if (subs.length === 0) {
        await loadStackImages(stackId);
      } else {
        setStackImages([]);
      }
    } catch (err) {
      console.error('Failed to load sub-stacks', err);
      setSubStacks([]);
      await loadStackImages(stackId);
    } finally {
      setSubStacksLoading(false);
    }
  }, [filters, loadStackImages]);

  const loadStackLandingRef = useRef(loadStackLanding);
  loadStackLandingRef.current = loadStackLanding;

  const prevSmartCoverRef = useRef(smartCoverEnabled);

  // Reload the active stack level when the selected stack, sub-stack, or filters change.
  useEffect(() => {
    if (activeStackId === null) {
      return;
    }
    if (activeUngroupedSubStack) {
      loadUngroupedSubStackImages(activeStackId);
      return;
    }
    if (activeSubStackId !== null) {
      loadSubStackImages(activeSubStackId);
      return;
    }
    loadStackLanding(activeStackId);
  }, [activeStackId, activeSubStackId, activeUngroupedSubStack, loadStackLanding, loadSubStackImages, loadUngroupedSubStackImages]);

  // Rebuild stack cache when stacks mode is first enabled
  useEffect(() => {
    if (stacksMode && !cacheBuilt) {
      bridge.rebuildStackCache({ smartCover: smartCoverEnabled }).then((result) => {
        console.log('[App] Stack cache rebuild result:', result);
        setCacheBuilt(true);
        refreshStacks();
      }).catch(err => {
        console.error('[App] Failed to rebuild stack cache:', err);
      });
    }
  }, [stacksMode, cacheBuilt, refreshStacks, smartCoverEnabled]);

  // After cache exists, changing Smart Cover should rebuild so rep rows stay consistent when backend honors the flag.
  useEffect(() => {
    const prev = prevSmartCoverRef.current;
    prevSmartCoverRef.current = smartCoverEnabled;
    if (!stacksMode || !cacheBuilt || prev === smartCoverEnabled) return;
    bridge.rebuildStackCache({ smartCover: smartCoverEnabled }).then(() => {
      refreshStacks();
    }).catch((err) => {
      console.error('[App] Failed to rebuild stack cache after Smart Cover change:', err);
    });
  }, [smartCoverEnabled, stacksMode, cacheBuilt, refreshStacks]);

  const clearStack = () => {
    setActiveStackId(null);
    setActiveStackInfo(null);
    setActiveSubStackId(null);
    setActiveUngroupedSubStack(false);
    setActiveSubStackInfo(null);
    setSubStacks([]);
    setStackImages([]);
    setSubStackImages([]);
  };

  const clearSubStack = () => {
    setActiveSubStackId(null);
    setActiveUngroupedSubStack(false);
    setActiveSubStackInfo(null);
    setSubStackImages([]);
  };

  const enableStacksMode = (enabled: boolean) => {
    setStacksMode(enabled);
    clearStack();
  };

  const handleSelectStack = (stack: ImageRow & { stack_id?: number | null; image_count?: number }, fallbackImageClick: (img: ImageRow) => void) => {
    if (stack.stack_id !== null && stack.stack_id !== undefined) {
      setActiveStackId(stack.stack_id);
      setActiveStackInfo({ stackId: stack.stack_id, imageCount: stack.image_count || 0 });
      setActiveSubStackId(null);
      setActiveUngroupedSubStack(false);
      setActiveSubStackInfo(null);
      setSubStacks([]);
      setStackImages([]);
      setSubStackImages([]);
    } else {
      fallbackImageClick(stack);
    }
  };

  const handleSelectSubStack = (subStack: ImageRow & { sub_stack_id?: number | null; image_count?: number; name?: string | null; is_ungrouped_sub_stack?: boolean }) => {
    if (subStack.is_ungrouped_sub_stack) {
      setActiveSubStackId(null);
      setActiveUngroupedSubStack(true);
      setActiveSubStackInfo({
        subStackId: null,
        imageCount: subStack.image_count || 0,
        name: subStack.name || 'Ungrouped',
      });
      setSubStackImages([]);
      return;
    }
    if (subStack.sub_stack_id === null || subStack.sub_stack_id === undefined) {
      return;
    }
    setActiveSubStackId(subStack.sub_stack_id);
    setActiveUngroupedSubStack(false);
    setActiveSubStackInfo({
      subStackId: subStack.sub_stack_id,
      imageCount: subStack.image_count || 0,
      name: subStack.name,
    });
    setSubStackImages([]);
  };

  const handleImageDeleteFromStack = (id: number) => {
    setStackImages(prev => prev.filter(img => img.id !== id));
    setSubStackImages(prev => prev.filter(img => img.id !== id));
    if (activeStackInfo) {
      setActiveStackInfo(prev => prev ? ({ ...prev, imageCount: Math.max(0, prev.imageCount - 1) }) : null);
    }
    if (activeSubStackInfo) {
      setActiveSubStackInfo(prev => prev ? ({ ...prev, imageCount: Math.max(0, prev.imageCount - 1) }) : null);
    }
  };

  const refreshActiveStackView = useCallback(async () => {
    if (activeStackId === null) return;
    if (activeUngroupedSubStack) {
      await loadUngroupedSubStackImagesRef.current(activeStackId);
      return;
    }
    if (activeSubStackId !== null) {
      await loadSubStackImagesRef.current(activeSubStackId);
      return;
    }
    await loadStackLandingRef.current(activeStackId);
  }, [activeStackId, activeSubStackId, activeUngroupedSubStack]);

  const isSubStackDetailActive = activeSubStackId !== null || activeUngroupedSubStack;
  const hasSubStackCards = activeStackId !== null && !isSubStackDetailActive && subStacks.length > 0;
  const activeStackDisplayImages = isSubStackDetailActive
    ? subStackImages
    : hasSubStackCards
      ? subStacks
      : stackImages;
  const activeStackDisplayLoading = isSubStackDetailActive
    ? subStackImagesLoading
    : (subStacksLoading || stackImagesLoading);

  const restoreActiveSubStack = useCallback((subStackId: number | null) => {
    setActiveSubStackId(subStackId);
    setActiveUngroupedSubStack(false);
    setActiveSubStackInfo(subStackId !== null ? { subStackId, imageCount: 0 } : null);
  }, []);

  return {
    stacksMode,
    setStacksMode,
    enableStacksMode,
    activeStackId,
    setActiveStackId,
    activeStackInfo,
    setActiveStackInfo,
    activeSubStackId,
    setActiveSubStackId: restoreActiveSubStack,
    activeUngroupedSubStack,
    setActiveUngroupedSubStack,
    activeSubStackInfo,
    setActiveSubStackInfo,
    cacheBuilt,
    subStacks,
    setSubStacks,
    subStacksLoading,
    stackImages,
    setStackImages,
    stackImagesLoading,
    subStackImages,
    setSubStackImages,
    subStackImagesLoading,
    activeStackDisplayImages,
    activeStackDisplayLoading,
    hasSubStackCards,
    loadStackImages,
    loadStackImagesRef,
    loadSubStackImages,
    loadSubStackImagesRef,
    loadUngroupedSubStackImages,
    loadUngroupedSubStackImagesRef,
    loadStackLanding,
    refreshActiveStackView,
    clearStack,
    clearSubStack,
    handleSelectStack,
    handleSelectSubStack,
    handleImageDeleteFromStack,
  };
}
