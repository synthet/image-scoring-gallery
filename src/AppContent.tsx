import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { MainLayout } from './components/Layout/MainLayout';
import { useImages, useKeywords, useStacks } from './hooks/useDatabase';
import { useFolders } from './hooks/useFolders';
import { FolderTree } from './components/Tree/FolderTree';
import type { Folder } from './components/Tree/treeUtils';
import { GalleryGrid } from './components/Gallery/GalleryGrid';
import { FilterPanel } from './components/Sidebar/FilterPanel';
import type { FilterState } from './components/Sidebar/FilterPanel';
import { ImageViewer } from './components/Viewer/ImageViewer';
import { NotificationTray } from './components/Layout/NotificationTray';
import { SettingsModal } from './components/Settings/SettingsModal';
import { DiagnosticsModal } from './components/Diagnostics/DiagnosticsModal';
import { ImportModal } from './components/Import/ImportModal';
import { SyncModal } from './components/Sync/SyncModal';
import { BackupModal } from './components/Backup/BackupModal';
import { SimilarSearchDrawer } from './components/Viewer/SimilarSearchDrawer';
import { SearchPage } from './components/Search/SearchPage';
import { KeywordsHubPage } from './components/Keywords/KeywordsHubPage';
import { Loader2, ChevronRight, RefreshCw, PanelLeft } from 'lucide-react';
import { useOperationStore } from './store/useOperationStore';
import { bridge } from './bridge';
import { useElectronListeners } from './hooks/useElectronListeners';
import { useGalleryNavigation } from './hooks/useGalleryNavigation';
import { useStacksMode } from './hooks/useStacksMode';
import { useImageOpener } from './hooks/useImageOpener';
import { useGalleryWebSocket } from './hooks/useGalleryWebSocket';
import { isSortOptionValue, useScoringSortOptions } from './hooks/useScoringSortOptions';

import { StackAnalyticsBanner } from './components/CullingAnalytics/StackAnalyticsBanner';
import { AgentCullReviewPanel } from './components/CullingAnalytics/AgentCullReviewPanel';
import { useAgentCullReview } from './hooks/useAgentCullReview';
import { toMediaUrl } from './utils/mediaUrl';
import breadcrumbStyles from './styles/breadcrumbs.module.css';
import toggleStyles from './styles/toggle.module.css';
import {
  folderIdExistsInTree,
  isBrowserPersistenceEnabled,
  readGalleryBrowserSnapshot,
  writeGalleryBrowserSnapshot,
} from './utils/galleryBrowserPersistence';
import {
  formatSpeciesLabel,
  getEffectiveKeyword,
  partitionKeywords,
  toImageQueryFilters,
} from './utils/keywordFilters';

function AppContent() {
  const [filters, setFilters] = useState<FilterState>({ minRating: 0, sortBy: 'capture_date', order: 'DESC' });
  const { sortOptions } = useScoringSortOptions();
  const [smartCoverEnabled, setSmartCoverEnabled] = useState(false);
  /** After first folder load in browser, restore session once so the next persist sees hydrated state. */
  const [browserSessionReady, setBrowserSessionReady] = useState(() => !isBrowserPersistenceEnabled());
  const activeOps = useOperationStore((s) => s.activeOps);

  useEffect(() => {
    let mounted = true;

    const loadConfig = async () => {
      try {
        const config = await bridge.getConfig();
        if (!mounted) return;
        setSmartCoverEnabled(Boolean(config.selection?.smartCoverEnabled));
      } catch (err) {
        console.error('Failed to load selection config', err);
      }
    };

    void loadConfig();

    const handleConfigUpdated = (evt: Event) => {
      const next = (evt as CustomEvent<{ selection?: { smartCoverEnabled?: boolean } }>).detail;
      setSmartCoverEnabled(Boolean(next?.selection?.smartCoverEnabled));
    };

    window.addEventListener('config-updated', handleConfigUpdated as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener('config-updated', handleConfigUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    const sortBy = filters.sortBy;
    if (!sortBy) return;
    if (isSortOptionValue(sortBy, sortOptions)) return;
    setFilters((prev) => ({ ...prev, sortBy: 'score_general' }));
  }, [filters.sortBy, sortOptions]);

  const { folders, loading: foldersLoading, refresh: refreshFolders } = useFolders();
  const { keywords, loading: keywordsLoading, fetch: fetchKeywords } = useKeywords();
  const { speciesKeywords, generalKeywords } = useMemo(
    () => partitionKeywords(keywords),
    [keywords],
  );

  const keywordSelectStyle = {
    background: '#333',
    color: '#eee',
    border: '1px solid #555',
    padding: '6px',
    borderRadius: 4,
    width: '100%',
    cursor: 'pointer',
  } as const;

  const {
    isSettingsOpen, setIsSettingsOpen,
    isDiagnosticsOpen, setIsDiagnosticsOpen,
    isSearchOpen,
    toolView, setToolView,
    isToolViewOpen,
    isImportModalOpen, setIsImportModalOpen,
    importFolderPath, setImportFolderPath,
    isSyncModalOpen, setIsSyncModalOpen,
    syncSourcePath,
    isBackupModalOpen, setIsBackupModalOpen,
    backupTargetPath,
  } = useElectronListeners();

  const [isSimilarDrawerOpen, setIsSimilarDrawerOpen] = useState(false);
  const [similarSearchImageId, setSimilarSearchImageId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingSearchQuery, setPendingSearchQuery] = useState<string | undefined>();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1100px)');
    const onMatch = () => {
      if (mq.matches) setSidebarOpen(false);
    };
    onMatch();
    mq.addEventListener('change', onMatch);
    return () => mq.removeEventListener('change', onMatch);
  }, []);

  const stacksModeRef = useRef(false);
  const activeStackIdRef = useRef<number | null>(null);

  const {
    selectedFolderId, setSelectedFolderId,
    includeSubfolders, setIncludeSubfolders,
    currentFolder, subfolderIds,
    handleSelectFolder: handleSelectFolderNav,
    handleNavigateToParent: handleNavigateToParentNav,
  } = useGalleryNavigation(folders, activeStackIdRef, () => {
    // cleared by useStacksMode on folder change
  });

  const queryFilters = useMemo(
    () => toImageQueryFilters(filters),
    [filters],
  );

  const imageFilters = useMemo(
    () => subfolderIds ? { ...queryFilters, folderIds: subfolderIds } : queryFilters,
    [queryFilters, subfolderIds],
  );

  const stackFilters = useMemo(
    () => ({ ...imageFilters, smartCover: smartCoverEnabled }),
    [imageFilters, smartCoverEnabled],
  );

  const {
    images, loading: imagesLoading, loadMore, totalCount, removeImage, refresh: refreshImages,
  } = useImages(50, selectedFolderId, imageFilters);

  // useStacksMode must run before useStacks (stacksMode arg). refreshStacks comes from useStacks,
  // so wire it through a ref to avoid a circular hook dependency. The callback must be stable
  // (useCallback) — useStacksMode lists it in effect deps, so an inline arrow would re-run those
  // effects every render and loop (Maximum update depth exceeded).
  const refreshStacksRef = useRef<(opts?: { preserveItems?: boolean }) => void>(() => {});
  const stableRefreshStacks = useCallback(
    (opts?: { preserveItems?: boolean }) => refreshStacksRef.current(opts),
    [],
  );

  const {
    stacksMode, setStacksMode, enableStacksMode,
    activeStackId, setActiveStackId,
    activeStackInfo, setActiveStackInfo,
    activeSubStackId, setActiveSubStackId,
    activeUngroupedSubStack, setActiveUngroupedSubStack,
    activeSubStackInfo, setActiveSubStackInfo,
    subStacks, setSubStacks,
    subStacksLoading,
    stackImages, setStackImages,
    stackImagesLoading,
    subStackImages, setSubStackImages,
    subStackImagesLoading,
    activeStackDisplayImages,
    activeStackDisplayLoading,
    hasSubStackCards,
    refreshActiveStackView,
    clearStack,
    clearSubStack,
    handleSelectStack: handleSelectStackBase,
    handleSelectSubStack,
    handleImageDeleteFromStack,
    cacheRebuilding,
  } = useStacksMode(
    filters,
    stableRefreshStacks,
    smartCoverEnabled,
  );

  const {
    stacks, loading: stacksLoading, loadMore: loadMoreStacks, totalCount: stacksTotalCount, refresh: refreshStacks,
  } = useStacks(50, selectedFolderId, stackFilters, stacksMode);

  // Keep refs up to date for WebSocket callbacks
  stacksModeRef.current = stacksMode;
  activeStackIdRef.current = activeStackId;
  const refreshImagesRef = useRef(refreshImages);
  refreshImagesRef.current = refreshImages;
  refreshStacksRef.current = refreshStacks;
  const refreshFoldersRef = useRef(refreshFolders);
  refreshFoldersRef.current = refreshFolders;

  useGalleryWebSocket({
    refreshImages,
    refreshStacks,
    refreshFolders,
    refreshActiveStackView,
    stacksModeRef,
    activeStackIdRef,
  });

  const refreshGallery = useCallback(() => {
    refreshImages();
    refreshFolders();
  }, [refreshImages, refreshFolders]);

  // When DB grows (e.g. after indexing), refresh grid + folder tree without restart.
  useEffect(() => {
    if (toolView !== null) return;

    const pollCount = async () => {
      try {
        const countOpts = subfolderIds
          ? { ...queryFilters, folderIds: subfolderIds }
          : queryFilters;
        const fresh = await bridge.getImageCount(countOpts);
        if (typeof fresh === 'number' && fresh > totalCount) {
          refreshGallery();
        }
      } catch {
        // ignore background poll failures
      }
    };

    const onFocus = () => {
      void pollCount();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [toolView, queryFilters, subfolderIds, totalCount, refreshGallery]);

  useEffect(() => {
    if (!isBrowserPersistenceEnabled()) return;
    if (foldersLoading || browserSessionReady) return;
    const snap = readGalleryBrowserSnapshot();
    if (snap) {
      setFilters(snap.filters);
      setSmartCoverEnabled(snap.smartCoverEnabled);
      if (
        snap.selectedFolderId !== undefined &&
        folderIdExistsInTree(folders, snap.selectedFolderId)
      ) {
        setSelectedFolderId(snap.selectedFolderId);
        setIncludeSubfolders(snap.includeSubfolders);
      }
      if (snap.stacksMode) {
        setStacksMode(true);
        if (snap.activeStackId !== null) {
          setActiveStackId(snap.activeStackId);
          setActiveStackInfo({ stackId: snap.activeStackId, imageCount: 0 });
          setActiveSubStackId(snap.activeSubStackId);
          setActiveUngroupedSubStack(false);
          if (snap.activeSubStackId !== null) {
            setActiveSubStackInfo({ subStackId: snap.activeSubStackId, imageCount: 0 });
          }
        }
      }
    }
    setBrowserSessionReady(true);
  }, [foldersLoading, folders, browserSessionReady, setActiveStackInfo, setActiveSubStackId, setActiveSubStackInfo, setActiveUngroupedSubStack, setStacksMode]);

  useEffect(() => {
    if (!isBrowserPersistenceEnabled() || !browserSessionReady) return;
    writeGalleryBrowserSnapshot({
      v: 1,
      selectedFolderId,
      includeSubfolders,
      stacksMode,
      activeStackId,
      activeSubStackId,
      currentView: 'gallery',
      filters,
      smartCoverEnabled,
    });
  }, [
    browserSessionReady,
    selectedFolderId,
    includeSubfolders,
    stacksMode,
    activeStackId,
    activeSubStackId,
    filters,
    smartCoverEnabled,
  ]);

  useEffect(() => {
    if (selectedFolderId === undefined || selectedFolderId === null) {
      void bridge.setSelectionPath(null);
      return;
    }
    const findFolder = (nodes: Folder[]): Folder | undefined => {
      for (const node of nodes) {
        if (node.id === selectedFolderId) return node;
        if (node.children) {
          const found = findFolder(node.children);
          if (found) return found;
        }
      }
    };
    const folder = findFolder(folders);
    if (folder && folder.path) {
      void bridge.setSelectionPath(folder.path);
    } else {
      void bridge.setSelectionPath(null);
    }
  }, [selectedFolderId, folders]);

  const handleNavigateToFolder = (folderId: number) => {
    setSelectedFolderId(folderId);
    setIncludeSubfolders(false);
    setActiveStackId(null);
    setActiveStackInfo(null);
    setActiveSubStackId(null);
    setActiveUngroupedSubStack(false);
    setActiveSubStackInfo(null);
    setSubStacks([]);
    setStackImages([]);
    setSubStackImages([]);
  };

  const handleSelectFolder = (folder: Folder) => {
    handleSelectFolderNav(folder);
    clearStack();
  };

  const handleNavigateToParent = () => {
    if (activeSubStackId !== null || activeUngroupedSubStack) {
      clearSubStack();
      return;
    }
    if (activeStackId !== null) {
      clearStack();
      return;
    }
    handleNavigateToParentNav();
  };

  // Current display list is shared by the grid and viewer opener so card/detail navigation stays aligned.
  const currentImages = (stacksMode && !activeStackId) ? stacks : (activeStackId ? activeStackDisplayImages : images);

  // Single agent-cull-review fetch shared by the panel (cards) and the grid (thumbnail overlays).
  const agentReview = useAgentCullReview(activeStackId ?? 0, activeSubStackId, {
    enabled: activeStackId !== null,
  });
  // image_id → file name, so the panel cards show filenames instead of raw ids (no extra query).
  const agentFileNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const img of currentImages) {
      if (img?.id != null && img.file_name) map.set(img.id, img.file_name);
    }
    return map;
  }, [currentImages]);
  // image_id → thumbnail media URL, so the panel cards show the picture being proposed.
  // Prefer the generated JPEG thumbnail (browser-decodable) over the RAW source path.
  const agentThumbnails = useMemo(() => {
    const map = new Map<number, string>();
    for (const img of currentImages) {
      if (img?.id != null && img.thumbnail_path) map.set(img.id, toMediaUrl(img.thumbnail_path));
    }
    return map;
  }, [currentImages]);
  // Transient highlight target: clearing it after the pulse lets a re-click replay the animation.
  const [agentHighlightImageId, setAgentHighlightImageId] = useState<number | null>(null);
  useEffect(() => {
    if (agentHighlightImageId == null) return;
    const timer = window.setTimeout(() => setAgentHighlightImageId(null), 1500);
    return () => window.clearTimeout(timer);
  }, [agentHighlightImageId]);

  const {
    openingImage,
    currentImageIndex,
    handleImageClick,
    handleNavigateImage,
    openImageById,
    openImageFromSearch,
    openImageFromList,
    viewerImages,
    handleImageDelete,
    closeViewer,
  } = useImageOpener({
    currentImages,
    activeStackId,
    activeSubStackId,
    selectedFolderId,
    onNavigateToFolder: handleNavigateToFolder,
    removeImage,
    handleImageDeleteFromStack,
  });

  const handleSelectStack = (stack: Parameters<typeof handleSelectStackBase>[0]) => {
    handleSelectStackBase(stack, handleImageClick);
  };

  // Current display count
  const currentTotal = activeSubStackId !== null || activeUngroupedSubStack
    ? (activeSubStackInfo?.imageCount || subStackImages.length)
    : hasSubStackCards
      ? subStacks.length
      : (stacksMode && !activeStackId)
        ? stacksTotalCount
        : (activeStackId ? (activeStackInfo?.imageCount || stackImages.length) : totalCount);
  const currentTotalLabel = hasSubStackCards
    ? 'sub-stacks'
    : stacksMode && !activeStackId
      ? 'items (grouped)'
      : 'items';

  const isInitialGridLoading = stacksMode && !activeStackId
    ? (stacksLoading && stacks.length === 0)
    : (activeStackId ? (activeStackDisplayLoading && currentImages.length === 0) : (imagesLoading && images.length === 0));

  const showGridLoadingBadge = !isInitialGridLoading && (
    activeSubStackId !== null || activeUngroupedSubStack
      ? (subStackImagesLoading || subStacksLoading)
      : activeStackId !== null
        ? (stackImagesLoading || subStacksLoading || subStackImagesLoading)
        : stacksMode
          ? stacksLoading
          : imagesLoading
  );

  const hasActiveFilters = useMemo(
    () =>
      filters.minRating > 0
      || Boolean(filters.colorLabel)
      || Boolean(getEffectiveKeyword(filters)?.trim())
      || Boolean(filters.capturedDate),
    [filters],
  );

  const headerTitle = toolView === 'search'
    ? 'Semantic Search'
    : toolView === 'keywords'
      ? 'Keywords'
      : activeUngroupedSubStack
      ? (activeSubStackInfo?.name || 'Ungrouped')
      : activeSubStackId !== null
        ? (activeSubStackInfo?.name || `Sub-stack #${activeSubStackId}`)
        : activeStackId
          ? `Stack #${activeStackId}`
          : (currentFolder ? (currentFolder.title || 'Folder') : 'Image Gallery');

  const breadcrumbsNode = useMemo(() => {
    type BreadcrumbPart = { label: string; onClick: () => void; isActive: boolean };
    const parts: BreadcrumbPart[] = [];

    if (selectedFolderId) {
      const findFolderChain = (nodes: Folder[], targetId: number, chain: Folder[]): Folder[] | null => {
        for (const node of nodes) {
          if (node.id === targetId) return [...chain, node];
          if (node.children) {
            const found = findFolderChain(node.children, targetId, [...chain, node]);
            if (found) return found;
          }
        }
        return null;
      };

      const chain = findFolderChain(folders, selectedFolderId, []) || [];
      chain.forEach((folder, idx) => {
        const isLast = idx === chain.length - 1 && !activeStackId;
        parts.push({
          label: folder.title || 'Folder',
          onClick: () => {
            setSelectedFolderId(folder.id);
            setIncludeSubfolders(false);
            setActiveStackId(null);
            setActiveStackInfo(null);
            setActiveSubStackId(null);
            setActiveUngroupedSubStack(false);
            setActiveSubStackInfo(null);
            setSubStacks([]);
            setStackImages([]);
            setSubStackImages([]);
          },
          isActive: isLast,
        });
      });
    }

    if (activeStackId) {
      parts.push({
        label: `Stack #${activeStackId}`,
        onClick: () => {
          clearSubStack();
        },
        isActive: activeSubStackId === null && !activeUngroupedSubStack,
      });
    }

    if (activeSubStackId !== null || activeUngroupedSubStack) {
      parts.push({
        label: activeUngroupedSubStack
          ? (activeSubStackInfo?.name || 'Ungrouped')
          : activeSubStackInfo?.name || `Sub-stack #${activeSubStackId}`,
        onClick: () => { },
        isActive: true,
      });
    }

    if (parts.length === 0) return null;

    return (
      <>
        {parts.map((part, index) => (
          <span key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={part.isActive ? undefined : part.onClick}
              disabled={part.isActive}
              aria-current={part.isActive ? 'page' : undefined}
              title={part.isActive ? undefined : `Go to ${part.label}`}
              className={breadcrumbStyles.breadcrumbButton}
            >
              {part.label}
            </button>
            {index < parts.length - 1 && <ChevronRight size={14} color="#666" />}
          </span>
        ))}
      </>
    );
  }, [
    folders,
    selectedFolderId,
    activeStackId,
    activeSubStackId,
    activeUngroupedSubStack,
    activeSubStackInfo?.name,
    clearSubStack,
    setActiveStackInfo,
    setActiveSubStackId,
    setActiveUngroupedSubStack,
    setActiveSubStackInfo,
    setSubStacks,
    setStackImages,
    setSubStackImages,
  ]);

  const canGalleryNavigateBack = useMemo(
    () =>
      isToolViewOpen
        ? true
        : activeSubStackId !== null || activeUngroupedSubStack || activeStackId !== null || selectedFolderId !== undefined,
    [isToolViewOpen, activeSubStackId, activeUngroupedSubStack, activeStackId, selectedFolderId],
  );

  return (
    <>
      <MainLayout
        sidebarOpen={sidebarOpen}
        breadcrumbs={isToolViewOpen ? null : breadcrumbsNode}
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="sidebarToggle"
              aria-label="Toggle filters sidebar"
              title="Toggle filters sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <PanelLeft size={16} />
            </button>
            <h2 style={{ margin: 0, fontSize: '1.2em' }}>{headerTitle}</h2>
            {!isToolViewOpen && (
            <span style={{ fontSize: '0.9em', color: 'var(--text-secondary)' }}>
              ({currentTotal} {currentTotalLabel})
            </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '15px', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              {!isToolViewOpen && (
                <button
                  type="button"
                  onClick={() => refreshGallery()}
                  title="Refresh gallery and folders from database"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 12px', background: '#333',
                    border: '1px solid #555', borderRadius: 16,
                    fontSize: '0.8em', color: '#ccc', fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={12} />
                  Refresh
                </button>
              )}
              {activeOps.size > 0 && Array.from(activeOps.values()).map((op, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (op.type === 'import') setIsImportModalOpen(true);
                    else if (op.type === 'sync') setIsSyncModalOpen(true);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 12px', background: 'rgba(0, 120, 212, 0.15)',
                    border: '1px solid rgba(0, 120, 212, 0.4)', borderRadius: 16,
                    fontSize: '0.8em', color: '#7cc4ff', fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  title="Click to show progress"
                >
                  <RefreshCw size={12} className="app-spinner" />
                  {op.label}
                </button>
              ))}
            </div>
          </div>
        }
        sidebar={
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ marginBottom: 15 }}>
              <button
                  type="button"
                  disabled={!canGalleryNavigateBack}
                  onClick={() => {
                    if (isToolViewOpen) {
                      setToolView(null);
                    } else {
                      handleNavigateToParent();
                    }
                  }}
                  aria-label={isToolViewOpen ? 'Back to gallery' : 'Back to previous folder'}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: canGalleryNavigateBack ? 'var(--color-success)' : '#3a3a3a',
                    color: canGalleryNavigateBack ? '#fff' : '#888',
                    border: 'none',
                    borderRadius: 4,
                    cursor: canGalleryNavigateBack ? 'pointer' : 'not-allowed',
                    fontWeight: 'bold',
                    borderLeft: canGalleryNavigateBack ? '4px solid #fff' : '4px solid #555',
                  }}
                >
                  {isToolViewOpen ? 'Back to Gallery' : 'Back'}
                </button>
            </div>

            <div style={{ padding: '0 0 10px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {!isToolViewOpen && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px', background: '#333', borderRadius: 4, border: '1px solid #555',
              }}>
                <span style={{ fontSize: '12px', color: '#ccc' }}>Stacks</span>
                <button
                  role="switch"
                  aria-checked={stacksMode}
                  aria-label="Stacks mode"
                  className={toggleStyles.toggle}
                  onClick={() => enableStacksMode(!stacksMode)}
                >
                  <span className={toggleStyles.thumb} />
                </button>
              </div>
              )}

              {/* Subfolders Toggle */}
              {currentFolder && currentFolder.children && currentFolder.children.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px', background: '#333', borderRadius: 4, border: '1px solid #555',
                }}>
                  <span style={{ fontSize: '12px', color: '#ccc' }}>
                    {isToolViewOpen ? (toolView === 'keywords' ? 'Include subfolders' : 'Include subfolders in search') : 'Show Subfolders'}
                  </span>
                  <button
                    role="switch"
                    aria-checked={includeSubfolders}
                    aria-label="Show subfolders"
                    className={toggleStyles.toggle}
                    onClick={() => setIncludeSubfolders(!includeSubfolders)}
                  >
                    <span className={toggleStyles.thumb} />
                  </button>
                </div>
              )}

              {toolView !== 'keywords' && (
              <select
                aria-label={isSearchOpen ? 'Also require keyword' : 'Filter by keyword'}
                title={isSearchOpen ? 'AND filter: results must also have this keyword' : undefined}
                value={filters.keyword || ''}
                onChange={(e) => {
                  const keyword = e.target.value || undefined;
                  setFilters({ ...filters, keyword, speciesKeyword: undefined });
                }}
                onFocus={fetchKeywords}
                style={keywordSelectStyle}
                disabled={keywordsLoading}
              >
                <option value="">{isSearchOpen ? 'Any keyword' : 'All Keywords'}</option>
                {generalKeywords.map((kw) => (
                  <option key={kw} value={kw}>{kw}</option>
                ))}
              </select>
              )}

              {toolView !== 'keywords' && filters.keyword === 'birds' && (
                <select
                  aria-label="Filter by species"
                  value={filters.speciesKeyword || ''}
                  onChange={(e) => setFilters({
                    ...filters,
                    speciesKeyword: e.target.value || undefined,
                  })}
                  onFocus={fetchKeywords}
                  style={keywordSelectStyle}
                  disabled={keywordsLoading}
                >
                  <option value="">All species</option>
                  {speciesKeywords.map((kw) => (
                    <option key={kw} value={kw}>{formatSpeciesLabel(kw)}</option>
                  ))}
                </select>
              )}

              <select
                aria-label={isSearchOpen ? 'Then sort by' : 'Sort by'}
                title={isSearchOpen ? 'Secondary sort after CLIP relevance' : undefined}
                value={filters.sortBy || 'score_general'}
                onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                style={{ background: '#333', color: '#eee', border: '1px solid #555', padding: '6px', borderRadius: 4, width: '100%', cursor: 'pointer' }}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <select
                aria-label="Sort order"
                value={filters.order || 'DESC'}
                onChange={(e) => setFilters({ ...filters, order: e.target.value as 'ASC' | 'DESC' })}
                style={{ background: '#333', color: '#eee', border: '1px solid #555', padding: '6px', borderRadius: 4, width: '100%', cursor: 'pointer' }}
              >
                <option value="DESC">Highest First</option>
                <option value="ASC">Lowest First</option>
              </select>
            </div>

            <FilterPanel filters={filters} onChange={setFilters} folderId={selectedFolderId} />

            <div style={{
              flex: 1, overflow: 'hidden', borderTop: '1px solid #333', paddingTop: 10,
              pointerEvents: isInitialGridLoading ? 'none' : 'auto',
              opacity: isInitialGridLoading ? 0.6 : 1,
              transition: 'opacity 0.2s',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}>
              {isToolViewOpen && (
                <div style={{ fontSize: '11px', color: '#888', marginBottom: 8, lineHeight: 1.4 }}>
                  {toolView === 'keywords'
                    ? 'Scope: select a folder below or leave unselected for the whole library.'
                    : 'Search scope: select a folder below or leave unselected for the whole library.'}
                </div>
              )}
              {foldersLoading ? <div>Loading folders...</div> : (
                <FolderTree folders={folders} onSelect={handleSelectFolder} selectedId={selectedFolderId} onRefresh={refreshFolders} />
              )}
            </div>
          </div>
        }
        content={
          <div style={{ height: '100%', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {toolView === 'search' ? (
              <SearchPage
                currentFolder={currentFolder}
                folderIds={subfolderIds}
                includeSubfolders={includeSubfolders}
                filters={filters}
                initialQuery={pendingSearchQuery}
                onInitialQueryApplied={() => setPendingSearchQuery(undefined)}
                onOpenImage={(id, searchResults) => {
                  void openImageFromSearch(id, searchResults);
                }}
              />
            ) : toolView === 'keywords' ? (
              <KeywordsHubPage
                currentFolder={currentFolder}
                folderIds={subfolderIds}
                includeSubfolders={includeSubfolders}
                filters={filters}
                onOpenImage={(id, images) => {
                  void openImageFromList(id, images);
                }}
                onSemanticSearch={(query) => {
                  setPendingSearchQuery(query);
                  setToolView('search');
                }}
              />
            ) : (
            <>
              {isInitialGridLoading && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
                    <div style={{ color: '#aaa', textAlign: 'center' }}>
                      {cacheRebuilding ? 'Building stack cache…' : 'Loading stacks…'}
                      {cacheRebuilding && (
                        <div style={{ fontSize: '0.85em', marginTop: 8, opacity: 0.8 }}>
                          First-time setup on large libraries can take a minute.
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {showGridLoadingBadge && (
                  <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(0, 0, 0, 0.7)', color: 'white', borderRadius: 20, fontSize: '0.85em', fontWeight: 500 }}>
                    <Loader2 size={14} className="app-spinner" />
                    Loading...
                  </div>
                )}
                {activeStackId !== null && <StackAnalyticsBanner stackId={activeStackId} />}
                {activeStackId !== null && (
                  <AgentCullReviewPanel
                    stackId={activeStackId}
                    subStackId={activeSubStackId}
                    review={agentReview}
                    fileNames={agentFileNames}
                    thumbnails={agentThumbnails}
                    onFocusImage={setAgentHighlightImageId}
                  />
                )}
                <GalleryGrid
                  key={`${selectedFolderId ?? 'all'}-${activeStackId ?? 'none'}-${activeSubStackId ?? 'none'}-${activeUngroupedSubStack ? 'ungrouped' : 'grouped'}-${stacksMode ? 'stacks' : 'images'}-${hasSubStackCards ? 'substacks' : 'flat'}`}
                  images={currentImages}
                  onSelect={handleImageClick}
                  onEndReached={activeStackId ? undefined : loadMore}
                  onNavigateToParent={handleNavigateToParent}
                  viewerOpen={!!openingImage}
                  subfolders={folders.flatMap(f => {
                    const find = (nodes: Folder[]): Folder | undefined => {
                      for (const node of nodes) {
                        if (node.id === selectedFolderId) return node;
                        if (node.children) {
                          const found = find(node.children);
                          if (found) return found;
                        }
                      }
                    };
                    return find([f])?.children || [];
                  })}
                  onSelectFolder={handleSelectFolder}
                  sortBy={filters.sortBy}
                  stacksMode={stacksMode}
                  stacks={stacks}
                  onSelectStack={handleSelectStack}
                  subStacksMode={hasSubStackCards}
                  onSelectSubStack={handleSelectSubStack}
                  onStackEndReached={loadMoreStacks}
                  activeStackId={activeStackId}
                  activeSubStackId={activeSubStackId}
                  onFindSimilar={(img) => {
                    setSimilarSearchImageId(img.id);
                    setIsSimilarDrawerOpen(true);
                  }}
                  filterEmptyActive={hasActiveFilters && !isInitialGridLoading}
                  agentRecommendations={activeStackId !== null ? agentReview.recommendationsByImageId : undefined}
                  onAgentAction={(rec, action) => {
                    if (action === 'approve') agentReview.approve(rec);
                    else agentReview.reject(rec);
                  }}
                  highlightImageId={agentHighlightImageId}
                />
                <SimilarSearchDrawer
                  open={isSimilarDrawerOpen}
                  onClose={() => setIsSimilarDrawerOpen(false)}
                  queryImageId={similarSearchImageId}
                  onSelectImage={(id) => {
                    void openImageById(id);
                    setIsSimilarDrawerOpen(false);
                  }}
                  onJumpToImageFolder={(id) => {
                    void openImageById(id);
                  }}
                />
            </>
            )}
            {openingImage && (
              <ImageViewer
                image={openingImage}
                onClose={closeViewer}
                allImages={viewerImages}
                currentIndex={currentImageIndex}
                onNavigate={handleNavigateImage}
                onDelete={handleImageDelete}
                onOpenImageById={openImageById}
                onOpenFolder={(folderId) => {
                  setToolView(null);
                  handleNavigateToFolder(folderId);
                  closeViewer();
                }}
                fallbackFolderId={selectedFolderId}
              />
            )}
          </div>
        }
      />
      <NotificationTray />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <DiagnosticsModal isOpen={isDiagnosticsOpen} onClose={() => setIsDiagnosticsOpen(false)} />
      <ImportModal
        isOpen={isImportModalOpen}
        folderPath={importFolderPath}
        onClose={() => {
          setIsImportModalOpen(false);
          setImportFolderPath('');
        }}
        onComplete={refreshFolders}
      />
      <SyncModal
        isOpen={isSyncModalOpen}
        sourcePath={syncSourcePath}
        onClose={() => setIsSyncModalOpen(false)}
        onComplete={() => {
          refreshImages();
          refreshFolders();
        }}
      />

      <BackupModal
        isOpen={isBackupModalOpen}
        targetPath={backupTargetPath}
        onClose={() => setIsBackupModalOpen(false)}
      />
    </>
  );
}

export default AppContent;
