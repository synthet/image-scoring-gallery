import React from 'react';
import { GalleryGrid } from '../Gallery/GalleryGrid';
import type { Folder } from '../Tree/treeUtils';
import type { FsImageRow } from './mapFsEntryToImageRow';

interface FsImageGridProps {
    images: FsImageRow[];
    subfolders: Folder[];
    onSelect: (image: FsImageRow) => void;
    onEndReached: () => void;
    onSelectFolder: (folder: Folder) => void;
    onNavigateToParent?: () => void;
    viewerOpen: boolean;
}

/**
 * Grid for folder mode: RAW-aware thumbnails and subfolder cards when a directory has no images yet.
 */
export const FsImageGrid: React.FC<FsImageGridProps> = ({
    images,
    subfolders,
    onSelect,
    onEndReached,
    onSelectFolder,
    onNavigateToParent,
    viewerOpen,
}) => {
    return (
        <GalleryGrid
            images={images}
            onSelect={onSelect}
            onEndReached={onEndReached}
            subfolders={subfolders}
            onSelectFolder={onSelectFolder}
            onNavigateToParent={onNavigateToParent}
            viewerOpen={viewerOpen}
            sortBy="score_technical"
            useGalleryThumbnail
        />
    );
};
