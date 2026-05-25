import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNotificationStore } from '../store/useNotificationStore';
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
  image_count?: number;
  sort_value?: number;
  folder_id?: number;
}

/** Minimal row for navigating the viewer from semantic text-search results. */
export interface SearchResultNavItem {
  image_id: number;
  file_path: string;
}

interface UseImageOpenerParams {
  images: ImageRow[];
  stackImages: ImageRow[];
  stacks: ImageRow[];
  stacksMode: boolean;
  activeStackId: number | null;
  selectedFolderId: number | undefined;
  onNavigateToFolder: (folderId: number) => void;
  removeImage: (id: number) => void;
  handleImageDeleteFromStack: (id: number) => void;
}

/**
 * Manages the image viewer lifecycle: opening, navigating, deleting images,
 * and resolving pending image opens when switching folders.
 */
export function useImageOpener({
  images,
  stackImages,
  stacks,
  stacksMode,
  activeStackId,
  selectedFolderId,
  onNavigateToFolder,
  removeImage,
  handleImageDeleteFromStack,
}: UseImageOpenerParams) {
  const addNotification = useNotificationStore(state => state.addNotification);

  const [openingImage, setOpeningImage] = useState<ImageRow | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [pendingOpenImageId, setPendingOpenImageId] = useState<number | null>(null);
  /** When set, viewer prev/next follows this list (e.g. semantic search results), not the folder grid. */
  const [viewerListOverride, setViewerListOverride] = useState<ImageRow[] | null>(null);

  const getCurrentList = useCallback(() => {
    return (stacksMode && !activeStackId) ? stacks : (activeStackId ? stackImages : images);
  }, [stacksMode, activeStackId, stacks, stackImages, images]);

  const getViewerList = useCallback(() => {
    return viewerListOverride ?? getCurrentList();
  }, [viewerListOverride, getCurrentList]);

  const searchResultsToImageRows = useCallback((results: SearchResultNavItem[]): ImageRow[] => {
    return results.map((r) => {
      const fileName = r.file_path.split(/[/\\]/).pop() ?? r.file_path;
      return {
        id: r.image_id,
        file_path: r.file_path,
        file_name: fileName,
        score_general: 0,
        rating: 0,
        label: null,
      };
    });
  }, []);

  const handleImageClick = (image: ImageRow) => {
    const imgList = getCurrentList();
    const index = imgList.findIndex(img => img.id === image.id);
    setViewerListOverride(null);
    setCurrentImageIndex(index >= 0 ? index : 0);
    setPendingOpenImageId(null);
    setOpeningImage(image);
  };

  const handleNavigateImage = (newIndex: number) => {
    const imgList = getViewerList();
    if (newIndex >= 0 && newIndex < imgList.length) {
      setCurrentImageIndex(newIndex);
      setPendingOpenImageId(null);
      setOpeningImage(imgList[newIndex]);
    }
  };

  const openImageById = useCallback(async (id: number): Promise<boolean> => {
    try {
      const details = await bridge.getImageDetails(id);
      if (!details) {
        addNotification('Unable to locate image details', 'warning');
        return false;
      }

      const currentList = (stacksMode && !activeStackId) ? stacks : (activeStackId ? stackImages : images);
      const existingIdx = currentList.findIndex(img => img.id === id);

      if (existingIdx >= 0) {
        setViewerListOverride(null);
        setCurrentImageIndex(existingIdx);
        setOpeningImage(currentList[existingIdx]);
        setPendingOpenImageId(null);
        return true;
      }

      setViewerListOverride(null);
      setOpeningImage(details as ImageRow);
      setCurrentImageIndex(-1);
      setPendingOpenImageId(id);

      if (details.folder_id && details.folder_id !== selectedFolderId) {
        onNavigateToFolder(details.folder_id);
      }

      return true;
    } catch (err) {
      console.error('Failed to open image by id:', err);
      addNotification('Failed to open image by id', 'error');
      return false;
    }
  }, [selectedFolderId, stacksMode, activeStackId, stacks, stackImages, images, addNotification, onNavigateToFolder]);

  const viewerImages = useMemo(() => getViewerList(), [getViewerList]);

  const openImageFromSearch = useCallback(async (
    id: number,
    results: SearchResultNavItem[],
  ): Promise<boolean> => {
    const navList = searchResultsToImageRows(results);
    const idx = navList.findIndex((img) => img.id === id);
    if (idx < 0) {
      return openImageById(id);
    }

    try {
      const details = await bridge.getImageDetails(id);
      if (!details) {
        addNotification('Unable to locate image details', 'warning');
        return false;
      }

      setViewerListOverride(navList);
      setPendingOpenImageId(null);
      setCurrentImageIndex(idx);
      setOpeningImage({ ...navList[idx], ...details } as ImageRow);
      return true;
    } catch (err) {
      console.error('Failed to open search result:', err);
      addNotification('Failed to open image', 'error');
      return false;
    }
  }, [searchResultsToImageRows, openImageById, addNotification]);

  useEffect(() => {
    if (!pendingOpenImageId || viewerListOverride) return;
    const list = getCurrentList();
    if (list.length === 0) return;

    const idx = list.findIndex(img => img.id === pendingOpenImageId);
    if (idx < 0) return;

    setCurrentImageIndex(idx);
    setOpeningImage(list[idx]);
    setPendingOpenImageId(null);
  }, [getCurrentList, pendingOpenImageId, viewerListOverride]);

  const handleImageDelete = (id: number) => {
    if (activeStackId) {
      handleImageDeleteFromStack(id);
    } else {
      removeImage(id);
    }
    setViewerListOverride(null);
    setOpeningImage(null);
  };

  const closeViewer = () => {
    setPendingOpenImageId(null);
    setViewerListOverride(null);
    setOpeningImage(null);
  };

  return {
    openingImage,
    currentImageIndex,
    viewerImages,
    pendingOpenImageId,
    handleImageClick,
    handleNavigateImage,
    openImageById,
    openImageFromSearch,
    handleImageDelete,
    closeViewer,
  };
}
