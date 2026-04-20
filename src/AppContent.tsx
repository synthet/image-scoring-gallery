import { useEffect, useMemo, useRef } from 'react';
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
import { Loader2, ChevronRight, RefreshCw } from 'lucide-react';
import { useOperationStore } from './store/useOperationStore';
import { useState } from 'react';
import { bridge } from './bridge';
import { useElectronListeners } from './hooks/useElectronListeners';
import { useGalleryNavigation } from './hooks/useGalleryNavigation';
import { useStacksMode } from './hooks/useStacksMode';
import { useImageOpener } from './hooks/useImageOpener';
import { useGalleryWebSocket } from './hooks/useGalleryWebSocket';
import breadcrumbStyles from './styles/breadcrumbs.module.css';
import toggleStyles from './styles/toggle.module.css';

function AppContent() {
  const [filters, setFilters] = useState<FilterState>({ minRating: 0, sortBy: 'capture_date', order: 'DESC' });
  const [smartCoverEnabled, setSmartCoverEnabled] = useState(false);
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

  const { folders, loading: foldersLoading, refresh: refreshFolders } = useFolders();
  const { keywords, loading: keywordsLoading, fetch: fetchKeywords } = useKeywords();

  const {
    isSettingsOpen, setIsSettingsOpen,
    isDiagnosticsOpen, setIsDiagnosticsOpen,
    isImportModalOpen, setIsImportModalOpen,
    importFolderPath, setImportFolderPath,
    isSyncModalOpen, setIsSyncModalOpen,
    syncSourcePath, setSyncSourcePath,
    isBackupModalOpen, setIsBackupModalOpen,
    backupTargetPath, setBackupTargetPath,
    currentView,
  } = useElectronListeners();

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
    () => ({
      minRating: filters.minRating,
      colorLabel: filters.colorLabel,
      keyword: filters.keyword,
      sortBy: filters.sortBy,
      order: filters.order,
      capturedDate: filters.capturedDate,
    }),
    [filters.minRating, filters.colorLabel, filters.keyword, filters.sortBy, filters.order, filters.capturedDate],
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

  const {
    stacks, loading: stacksLoading, loadMore: loadMoreStacks, totalCount: stacksTotalCount, refresh: refreshStacks,
  } = useStacks(50, selectedFolderId, stackFilters);

  const {
    stacksMode, enableStacksMode,
    activeStackId, setActiveStackId,
    activeStackInfo, setActiveStackInfo,
    stackImages, setStackImages,
    stackImagesLoading,
    loadStackImages,
    clearStack,
    handleSelectStack: handleSelectStackBase,
    handleImageDeleteFromStack,
  } = useStacksMode(selectedFolderId, filters, refreshStacks, smartCoverEnabled);

  // Keep refs up to date for WebSocket callbacks
  stacksModeRef.current = stacksMode;
  activeStackIdRef.current = activeStackId;
  const refreshImagesRef = useRef(refreshImages);
  refreshImagesRef.current = refreshImages;
  const refreshStacksRef = useRef(refreshStacks);
  refreshStacksRef.current = refreshStacks;
  const refreshFoldersRef = useRef(refreshFolders);
  refreshFoldersRef.current = refreshFolders;

  useGalleryWebSocket({
    refreshImages,
    refreshStacks,
    refreshFolders,
    loadStackImages,
    stacksModeRef,
    activeStackIdRef,
  });


  const handleNavigateToFolder = (folderId: number) => {
    setSelectedFolderId(folderId);
    setIncludeSubfolders(false);
    setActiveStackId(null);
    setActiveStackInfo(null);
    setStackImages([]);
  };

  const handleSelectFolder = (folder: Folder) => {
    handleSelectFolderNav(folder);
    clearStack();
  };

  const handleNavigateToParent = () => {
    if (activeStackId !== null) {
      clearStack();
      return;
    }
    handleNavigateToParentNav();
  };

  const {
    openingImage,
    currentImageIndex,
    handleImageClick,
    handleNavigateImage,
    openImageById,
    handleImageDelete,
    closeViewer,
  } = useImageOpener({
    images,
    stackImages,
    stacks,
    stacksMode,
    activeStackId,
    selectedFolderId,
    onNavigateToFolder: handleNavigateToFolder,
    removeImage,
    handleImageDeleteFromStack,
  });

  const handleSelectStack = (stack: Parameters<typeof handleSelectStackBase>[0]) => {
    handleSelectStackBase(stack, handleImageClick);
  };

  // Current display list and count
  const currentImages = (stacksMode && !activeStackId) ? stacks : (activeStackId ? stackImages : images);
  const currentTotal = stacksMode && !activeStackId
    ? stacksTotalCount
    : (activeStackId ? (activeStackInfo?.imageCount || stackImages.length) : totalCount);

  const isInitialGridLoading = stacksMode && !activeStackId
    ? (stacksLoading && stacks.length === 0)
    : (activeStackId ? stackImagesLoading : (imagesLoading && images.length === 0));

  const headerTitle = activeStackId
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
            setStackImages([]);
          },
          isActive: isLast,
        });
      });
    }

    if (activeStackId) {
      parts.push({ label: `Stack #${activeStackId}`, onClick: () => { }, isActive: true });
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
  }, [folders, selectedFolderId, activeStackId, currentView]);

  const canGalleryNavigateBack = useMemo(
    () => activeStackId !== null || selectedFolderId !== undefined,
    [activeStackId, selectedFolderId],
  );

  return (
    <>
      <MainLayout
        breadcrumbs={breadcrumbsNode}
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: '1.2em' }}>{headerTitle}</h2>
            <span style={{ fontSize: '0.9em', color: '#888' }}>
              ({currentTotal} {stacksMode && !activeStackId ? 'items (grouped)' : 'items'})
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '15px', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
                onClick={() => handleNavigateToParent()}
                aria-label="Back to previous folder"
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: canGalleryNavigateBack ? '#4caf50' : '#3a3a3a',
                  color: canGalleryNavigateBack ? '#fff' : '#888',
                  border: 'none',
                  borderRadius: 4,
                  cursor: canGalleryNavigateBack ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold',
                  borderLeft: canGalleryNavigateBack ? '4px solid #fff' : '4px solid #555',
                }}
              >
                Back
              </button>
            </div>

            <div style={{ padding: '0 0 10px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {/* Stacks Toggle */}
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

              {/* Subfolders Toggle */}
              {currentFolder && currentFolder.children && currentFolder.children.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px', background: '#333', borderRadius: 4, border: '1px solid #555',
                }}>
                  <span style={{ fontSize: '12px', color: '#ccc' }}>Show Subfolders</span>
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

              <select
                aria-label="Filter by keyword"
                value={filters.keyword || ''}
                onChange={(e) => setFilters({ ...filters, keyword: e.target.value || undefined })}
                onFocus={fetchKeywords}
                style={{ background: '#333', color: '#eee', border: '1px solid #555', padding: '6px', borderRadius: 4, width: '100%', cursor: 'pointer' }}
                disabled={keywordsLoading}
              >
                <option value="">All Keywords</option>
                {keywords.map((kw) => (
                  <option key={kw} value={kw}>{kw}</option>
                ))}
              </select>

              <select
                aria-label="Sort by"
                value={filters.sortBy || 'score_general'}
                onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                style={{ background: '#333', color: '#eee', border: '1px solid #555', padding: '6px', borderRadius: 4, width: '100%', cursor: 'pointer' }}
              >
                <option value="score_general">General Score</option>
                <option value="capture_date">Capture Date</option>
                <option value="id">ID</option>
                <option value="score_technical">Technical Score</option>
                <option value="score_aesthetic">Aesthetic Score</option>
                <option value="score_spaq">SPAQ</option>
                <option value="score_ava">AVA</option>
                <option value="score_liqe">LIQE</option>
                <option value="score_koniq">KonIQ</option>
                <option value="score_paq2piq">Paq2Piq</option>
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
            }}>
              {foldersLoading ? <div>Loading folders...</div> : (
                <FolderTree folders={folders} onSelect={handleSelectFolder} selectedId={selectedFolderId} onRefresh={refreshFolders} />
              )}
            </div>
          </div>
        }
        content={
          <div style={{ height: '100%', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {currentView === 'gallery' && (
              <>
                {isInitialGridLoading && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
                    <div style={{ color: '#aaa' }}>Loading images...</div>
                  </div>
                )}
                {(stackImagesLoading || imagesLoading || stacksLoading) && !isInitialGridLoading && (
                  <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(0, 0, 0, 0.7)', color: 'white', borderRadius: 20, fontSize: '0.85em', fontWeight: 500 }}>
                    <Loader2 size={14} className="app-spinner" />
                    Loading...
                  </div>
                )}
                <GalleryGrid
                  key={`${selectedFolderId ?? 'all'}-${activeStackId ?? 'none'}-${stacksMode ? 'stacks' : 'images'}`}
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
                  onStackEndReached={loadMoreStacks}
                  activeStackId={activeStackId}
                />
                {openingImage && (
                  <ImageViewer
                    image={openingImage}
                    onClose={closeViewer}
                    allImages={currentImages}
                    currentIndex={currentImageIndex}
                    onNavigate={handleNavigateImage}
                    onDelete={handleImageDelete}
                    onOpenImageById={openImageById}
                    onOpenFolder={(folderId) => {
                      handleNavigateToFolder(folderId);
                      closeViewer();
                    }}
                  />
                )}
              </>
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
