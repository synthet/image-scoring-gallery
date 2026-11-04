import React from 'react';
import { GalleryGrid } from '../Gallery/GalleryGrid';
import type { Folder } from '../Tree/treeUtils';
import type { FsImageRow } from './mapFsEntryToImageRow';
import type { GridSelection } from '../../utils/gridSelection';

interface FsImageGridProps {
    images: FsImageRow[];
    subfolders: Folder[];
    onSelect: (image: FsImageRow) => void;
    onEndReached: () => void;
    onSelectFolder: (folder: Folder) => void;
    onNavigateToParent?: () => void;
    viewerOpen: boolean;
    selection: GridSelection;
    onSelectionChange: (selection: GridSelection) => void;
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
    selection,
    onSelectionChange,
}) => {
    return (
        <GalleryGrid
            images={images}
            onSelect={(image) => onSelect(image as FsImageRow)}
            onEndReached={onEndReached}
            subfolders={subfolders}
            onSelectFolder={onSelectFolder}
            onNavigateToParent={onNavigateToParent}
            viewerOpen={viewerOpen}
            selection={selection}
            onSelectionChange={onSelectionChange}
            sortBy="score_technical"
            useGalleryThumbnail
        />
    );
};
