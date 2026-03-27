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

  const getCurrentList = useCallback(() => {
    return (stacksMode && !activeStackId) ? stacks : (activeStackId ? stackImages : images);
  }, [stacksMode, activeStackId, stacks, stackImages, images]);

  const handleImageClick = (image: ImageRow) => {
    const imgList = getCurrentList();
    const index = imgList.findIndex(img => img.id === image.id);
    setCurrentImageIndex(index >= 0 ? index : 0);
    setPendingOpenImageId(null);
    setOpeningImage(image);
  };

  const handleNavigateImage = (newIndex: number) => {
    const imgList = getCurrentList();
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
        setCurrentImageIndex(existingIdx);
        setOpeningImage(currentList[existingIdx]);
        setPendingOpenImageId(null);
        return true;
      }

      setOpeningImage(details as ImageRow);
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

  const currentImages = useMemo(
    () => (stacksMode && !activeStackId) ? stacks : (activeStackId ? stackImages : images),
    [stacksMode, activeStackId, stacks, stackImages, images],
  );

  useEffect(() => {
    if (!pendingOpenImageId || currentImages.length === 0) return;

    const idx = currentImages.findIndex(img => img.id === pendingOpenImageId);
    if (idx < 0) return;

    setCurrentImageIndex(idx);
    setOpeningImage(currentImages[idx]);
    setPendingOpenImageId(null);
  }, [currentImages, pendingOpenImageId]);

  const handleImageDelete = (id: number) => {
    if (activeStackId) {
      handleImageDeleteFromStack(id);
    } else {
      removeImage(id);
    }
    setOpeningImage(null);
  };

  const closeViewer = () => {
    setPendingOpenImageId(null);
    setOpeningImage(null);
  };

  return {
    openingImage,
    currentImageIndex,
    pendingOpenImageId,
    handleImageClick,
    handleNavigateImage,
    openImageById,
    handleImageDelete,
    closeViewer,
  };
}
