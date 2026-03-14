import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { MainLayout } from './components/Layout/MainLayout';
import { useImages, useKeywords, useStacks } from './hooks/useDatabase';
import { useFolders } from './hooks/useFolders';
import { FolderTree } from './components/Tree/FolderTree';
import type { Folder } from './components/Tree/treeUtils';
import { GalleryGrid } from './components/Gallery/GalleryGrid';
import { FilterPanel } from './components/Sidebar/FilterPanel';
import type { FilterState } from './components/Sidebar/FilterPanel';
import { ImageViewer } from './components/Viewer/ImageViewer';
import { useNotificationStore } from './store/useNotificationStore';
import { useJobProgressStore } from './store/useJobProgressStore';
import { NotificationTray } from './components/Layout/NotificationTray';
import { SettingsModal } from './components/Settings/SettingsModal';
import { DuplicateFinder } from './components/Duplicates/DuplicateFinder';
import { ImportModal } from './components/Import/ImportModal';
import { Loader2, ChevronRight } from 'lucide-react';
import breadcrumbStyles from './styles/breadcrumbs.module.css';
import toggleStyles from './styles/toggle.module.css';

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

interface AppContentProps {
  isConnected: boolean;
}

function AppContent({ isConnected }: AppContentProps) {
  const addNotification = useNotificationStore(state => state.addNotification);

  const { folders, loading: foldersLoading, refresh: refreshFolders } = useFolders();
  const { keywords, loading: keywordsLoading, fetch: fetchKeywords } = useKeywords();
  const refreshFoldersRef = useRef(refreshFolders);
  refreshFoldersRef.current = refreshFolders;

  const [selectedFolderId, setSelectedFolderId] = useState<number | undefined>(undefined);
  const [filters, setFilters] = useState<FilterState>({ minRating: 0, sortBy: 'score_general', order: 'DESC' });
  const [openingImage, setOpeningImage] = useState<ImageRow | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [initialSimilarSearchImageId, setInitialSimilarSearchImageId] = useState<number | null>(null);
  const [pendingOpenImageId, setPendingOpenImageId] = useState<number | null>(null);
  const [currentView, setCurrentView] = useState<'gallery' | 'duplicates'>('gallery');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFolderPath, setImportFolderPath] = useState('');

  useEffect(() => {
    // Register settings menu listener
    let cleanupSettings: (() => void) | undefined;
    if (window.electron?.onOpenSettings) {
      cleanupSettings = window.electron.onOpenSettings(() => {
        setIsSettingsOpen(true);
      });
    }

    let cleanupDuplicates: (() => void) | undefined;
    if (window.electron?.onOpenDuplicates) {
      cleanupDuplicates = window.electron.onOpenDuplicates(() => {
        setCurrentView('duplicates');
      });
    }

    let cleanupImport: (() => void) | undefined;
    if (window.electron?.onImportFolderSelected) {
      cleanupImport = window.electron.onImportFolderSelected((path) => {
        setImportFolderPath(path);
        setIsImportModalOpen(true);
      });
    }

    let cleanupNotification: (() => void) | undefined;
    if (window.electron?.onShowNotification) {
      cleanupNotification = window.electron.onShowNotification((data) => {
        addNotification(data.message, data.type);
      });
    }

    return () => {
      if (cleanupSettings) cleanupSettings();
      if (cleanupDuplicates) cleanupDuplicates();
      if (cleanupImport) cleanupImport();
      if (cleanupNotification) cleanupNotification();
    };
  }, [addNotification]);

  // Subfolders toggle
  const [includeSubfolders, setIncludeSubfolders] = useState(false);

  // Stacks mode state
  const [stacksMode, setStacksMode] = useState(false);
  const [activeStackId, setActiveStackId] = useState<number | null>(null);
  const [activeStackInfo, setActiveStackInfo] = useState<{ stackId: number; imageCount: number } | null>(null);
  const [cacheBuilt, setCacheBuilt] = useState(false);

  const [stackImages, setStackImages] = useState<ImageRow[]>([]);
  const [stackImagesLoading, setStackImagesLoading] = useState(false);

  // Load images when activeStackId changes or filters change while inside a stack
  const loadStackImages = useCallback(async (stackId: number) => {
    if (!window.electron) return;
    setStackImagesLoading(true);
    try {
      const options = { folderId: selectedFolderId, ...filters };
      const imgs = await window.electron.getImagesByStack(stackId, options);
      setStackImages(imgs);
    } catch (err) {
      console.error("Failed to load stack images", err);
    } finally {
      setStackImagesLoading(false);
    }
  }, [selectedFolderId, filters]);
  const loadStackImagesRef = useRef(loadStackImages);
  loadStackImagesRef.current = loadStackImages;

  // React to filter changes while viewing a stack
  useEffect(() => {
    if (activeStackId !== null) {
      loadStackImages(activeStackId);
    }
  }, [activeStackId, loadStackImages]);

  // Subscribe to real-time updates from Python API
  useEffect(() => {
    type WebSocketClient = {
      connect: () => Promise<void> | void;
      disconnect: () => void;
      on: (type: string, handler: (data: unknown) => void) => void;
      off: (type: string, handler: (data: unknown) => void) => void;
    };

    let cancelled = false;
    let ws: WebSocketClient | null = null;
    let imageRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    let folderRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const subscriptions: Array<{ type: string; handler: (data: unknown) => void }> = [];

    const scheduleVisibleRefresh = () => {
      if (imageRefreshTimer) return;
      imageRefreshTimer = setTimeout(() => {
        imageRefreshTimer = null;

        if (activeStackIdRef.current !== null) {
          void loadStackImagesRef.current(activeStackIdRef.current);
          return;
        }

        if (stacksModeRef.current) {
          refreshStacksRef.current({ preserveItems: true });
          return;
        }

        refreshImagesRef.current({ preserveItems: true });
      }, 500);
    };

    const scheduleFolderRefresh = () => {
      if (folderRefreshTimer) return;
      folderRefreshTimer = setTimeout(() => {
        folderRefreshTimer = null;
        refreshFoldersRef.current();
      }, 500);
    };

    import('./services/WebSocketService').then(({ webSocketService }) => {
      if (cancelled) return;

      ws = webSocketService;
      void ws.connect();

      const subscribe = (type: string, handler: (data: unknown) => void) => {
        ws?.on(type, handler);
        subscriptions.push({ type, handler });
      };

      subscribe('stack_created', (data: unknown) => {
        const d = data as { summary?: string };
        console.log('[App] Received stack_created event:', d);
        addNotification(`New stack created: ${d.summary || 'Summary not available'}`, 'success');
        if (window.electron) {
          window.electron.rebuildStackCache().then(() => {
            console.log('[App] Stack cache rebuilt due to external event.');
            scheduleVisibleRefresh();
          });
        }
      });

      subscribe('folder_discovered', (data: unknown) => {
        const d = data as { path: string };
        console.log('[App] Folder discovered:', d.path);
        addNotification(`Discovered folder: ${d.path.split(/[\\/]/).pop()}`, 'info');
      });

      subscribe('image_discovered', () => {
        // Silent for individual images to avoid spam, but could use for status bar
      });

      subscribe('image_scored', (data: unknown) => {
        const d = data as { file_path: string };
        console.log('[App] Image scored:', d.file_path);
      });

      subscribe('image_updated', () => {
        scheduleVisibleRefresh();
        scheduleFolderRefresh();
      });

      subscribe('folder_updated', () => {
        scheduleFolderRefresh();
      });

      subscribe('job_started', (data: unknown) => {
        const d = data as { job_type: string; job_id: string };
        console.log('[App] Job started:', d);
        const typeLabel = d.job_type === 'scoring' ? 'Scoring' :
          d.job_type === 'tagging' ? 'Tagging' :
            d.job_type === 'clustering' ? 'Clustering' : 'Process';
        addNotification(`${typeLabel} job started (ID: ${d.job_id})`, 'info');
        useJobProgressStore.getState().startJob(String(d.job_id), d.job_type);
      });

      subscribe('job_progress', (data: unknown) => {
        const d = data as { job_id: string | number; current: number; total: number; message?: string };
        useJobProgressStore.getState().updateProgress(String(d.job_id), d.current, d.total, d.message);
      });

      subscribe('job_completed', (data: unknown) => {
        const d = data as { status: string; job_id: string };
        console.log('[App] Job completed:', d);
        const status = d.status === 'completed' ? 'finished successfully' : 'failed';
        const type = d.status === 'completed' ? 'success' : 'error';
        addNotification(`Job ${d.job_id} ${status}`, type);
        useJobProgressStore.getState().completeJob(String(d.job_id));

        // Refresh stacks if it was a clustering/selection job
        if (d.status === 'completed' && window.electron) {
          window.electron.rebuildStackCache().then(() => {
            console.log('[App] Stack cache rebuilt after job completion.');
            scheduleVisibleRefresh();
            scheduleFolderRefresh();
          });
        }
      });

    }).catch(err => {
      console.error('[App] Failed to initialize WebSocket service:', err);
    });

    return () => {
      cancelled = true;
      subscriptions.forEach(({ type, handler }) => {
        ws?.off(type, handler);
      });
      if (imageRefreshTimer) clearTimeout(imageRefreshTimer);
      if (folderRefreshTimer) clearTimeout(folderRefreshTimer);
      if (ws) ws.disconnect();
    };
  }, [addNotification]);


  const handleSelectFolder = (folder: Folder) => {
    setSelectedFolderId(folder.id);
    setIncludeSubfolders(false);
    setActiveStackId(null);
    setActiveStackInfo(null);
    setStackImages([]);
  };

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
    return find(folders);
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

  const imageFilters = useMemo(() => subfolderIds ? { ...filters, folderIds: subfolderIds } : filters, [filters, subfolderIds]);
  const { images, loading: imagesLoading, loadMore, totalCount, removeImage, refresh: refreshImages } = useImages(50, selectedFolderId, imageFilters);
  const refreshImagesRef = useRef(refreshImages);
  refreshImagesRef.current = refreshImages;
  const { stacks, loading: stacksLoading, loadMore: loadMoreStacks, totalCount: stacksTotalCount, refresh: refreshStacks } = useStacks(50, selectedFolderId, imageFilters);
  const refreshStacksRef = useRef(refreshStacks);
  refreshStacksRef.current = refreshStacks;
  const stacksModeRef = useRef(stacksMode);
  stacksModeRef.current = stacksMode;
  const activeStackIdRef = useRef(activeStackId);
  activeStackIdRef.current = activeStackId;

  // Determine if grid is doing an initial load
  const isInitialGridLoading = stacksMode && !activeStackId
    ? (stacksLoading && stacks.length === 0)
    : (activeStackId ? stackImagesLoading : (imagesLoading && images.length === 0));

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

  const handleImageClick = (image: ImageRow) => {
    setInitialSimilarSearchImageId(null);
    const imgList = (stacksMode && !activeStackId) ? stacks : (activeStackId ? stackImages : images);
    const index = imgList.findIndex(img => img.id === image.id);
    setCurrentImageIndex(index >= 0 ? index : 0);
    setPendingOpenImageId(null);
    setOpeningImage(image);
  };

  const handleNavigateImage = (newIndex: number) => {
    const imgList = (stacksMode && !activeStackId) ? stacks : (activeStackId ? stackImages : images);
    if (newIndex >= 0 && newIndex < imgList.length) {
      setCurrentImageIndex(newIndex);
      setPendingOpenImageId(null);
      setOpeningImage(imgList[newIndex]);
    }
  };

  const openImageById = useCallback(async (id: number): Promise<boolean> => {
    if (!window.electron) return false;

    try {
      const details = await window.electron.getImageDetails(id);
      if (!details) {
        addNotification('Unable to locate image details', 'warning');
        return false;
      }

      // If we are already in the correct folder and the image is loaded, just navigate to it
      const currentList = (stacksMode && !activeStackId) ? stacks : (activeStackId ? stackImages : images);
      const existingIdx = currentList.findIndex(img => img.id === id);

      if (existingIdx >= 0) {
        setCurrentImageIndex(existingIdx);
        setOpeningImage(currentList[existingIdx]);
        setPendingOpenImageId(null);
        return true;
      }

      // Otherwise, prepare to switch folders and wait for load
      setOpeningImage(details as ImageRow);
      setPendingOpenImageId(id);

      if (details.folder_id && details.folder_id !== selectedFolderId) {
        setSelectedFolderId(details.folder_id);
        setIncludeSubfolders(false);
        setActiveStackId(null);
        setActiveStackInfo(null);
        setStackImages([]);
      }

      return true;
    } catch (err) {
      console.error('Failed to open image by id:', err);
      addNotification('Failed to open image by id', 'error');
      return false;
    }
  }, [selectedFolderId, stacksMode, activeStackId, stacks, stackImages, images, addNotification]);

  useEffect(() => {
    if (!pendingOpenImageId) return;

    const imgList = (stacksMode && !activeStackId) ? stacks : (activeStackId ? stackImages : images);
    const idx = imgList.findIndex(img => img.id === pendingOpenImageId);

    if (idx >= 0) {
      setCurrentImageIndex(idx);
      setOpeningImage(imgList[idx]);
      setPendingOpenImageId(null);
      return;
    }

    // If we've finished loading and still can't find it, clear the pending state
    if (!imagesLoading && !stackImagesLoading && !stacksLoading) {
      console.warn('[App] Could not find pending image index after loading:', pendingOpenImageId);
      setPendingOpenImageId(null);
    }
  }, [pendingOpenImageId, stacksMode, activeStackId, stacks, stackImages, images, imagesLoading, stackImagesLoading, stacksLoading]);

  const handleImageDelete = (id: number) => {
    if (activeStackId) {
      setStackImages(prev => prev.filter(img => img.id !== id));
      if (activeStackInfo) {
        setActiveStackInfo(prev => prev ? ({ ...prev, imageCount: Math.max(0, prev.imageCount - 1) }) : null);
      }
    } else {
      removeImage(id);
    }
    setOpeningImage(null);
  };

  const handleSelectStack = (stack: ImageRow & { stack_id?: number | null; image_count?: number }) => {
    if (stack.stack_id !== null && stack.stack_id !== undefined) {
      setActiveStackId(stack.stack_id);
      setActiveStackInfo({ stackId: stack.stack_id, imageCount: stack.image_count || 0 });
      loadStackImages(stack.stack_id);
    } else {
      handleImageClick(stack);
    }
  };

  const handleNavigateToParent = () => {
    if (activeStackId) {
      setActiveStackId(null);
      setActiveStackInfo(null);
      setStackImages([]);
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



  const handleFindSimilarFromGrid = (image: ImageRow) => {
    handleImageClick(image);
    setInitialSimilarSearchImageId(image.id);
  };

  const closeViewer = () => {
    setInitialSimilarSearchImageId(null);
    setPendingOpenImageId(null);
    setOpeningImage(null);
  };

  // Determine current display
  const currentImages = (stacksMode && !activeStackId) ? stacks : (activeStackId ? stackImages : images);
  const currentTotal = stacksMode && !activeStackId ? stacksTotalCount : (activeStackId ? (activeStackInfo?.imageCount || stackImages.length) : totalCount);

  useEffect(() => {
    if (!pendingOpenImageId || currentImages.length === 0) return;

    const idx = currentImages.findIndex(img => img.id === pendingOpenImageId);
    if (idx < 0) return;

    setCurrentImageIndex(idx);
    setOpeningImage(currentImages[idx]);
    setPendingOpenImageId(null);
  }, [currentImages, pendingOpenImageId]);

  // Header title
  const headerTitle = (() => {
    if (activeStackId) {
      return `Stack #${activeStackId}`;
    }
    return currentFolder ? (currentFolder.title || 'Folder') : 'Image Gallery';
  })();

  const breadcrumbsNode = useMemo(() => {
    if (currentView === 'duplicates') return null;

    type BreadcrumbPart = {
      label: string;
      onClick: () => void;
      isActive: boolean;
    };

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
          isActive: isLast
        });
      });
    }

    if (activeStackId) {
      parts.push({
        label: `Stack #${activeStackId}`,
        onClick: () => { },
        isActive: true
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
            {index < parts.length - 1 && (
              <ChevronRight size={14} color="#666" />
            )}
          </span>
        ))}
      </>
    );
  }, [folders, selectedFolderId, activeStackId, currentView]);

  return (
    <>
      <MainLayout
        breadcrumbs={breadcrumbsNode}
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: '1.2em' }}>
              {headerTitle}
            </h2>
            <span style={{ fontSize: '0.9em', color: '#888' }}>
              ({currentTotal} {stacksMode && !activeStackId ? 'stacks' : 'items'})
            </span>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '15px', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              {/* Header actions can go here */}
            </div>
          </div>
        }
        sidebar={
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', height: '100%' }}>

            {currentView === 'duplicates' && (
              <div style={{ marginBottom: 15 }}>
                <button
                  onClick={() => setCurrentView('gallery')}
                  style={{
                    width: '100%', padding: '10px',
                    backgroundColor: '#4caf50',
                    color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
                    fontWeight: 'bold', borderLeft: '4px solid #fff'
                  }}
                >
                  Back to Gallery
                </button>
              </div>
            )}

            <h3 style={{ marginBottom: 10, marginTop: 0 }}>Folders</h3>
            <div style={{ marginBottom: 10, fontSize: '0.8em', color: '#888' }}>
              <p>DB Status:
                <span style={{
                  color: isConnected ? '#4caf50' : '#f44336',
                  fontWeight: 'bold',
                  marginLeft: 5
                }}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </p>
            </div>

            <div style={{ padding: '0 0 10px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {/* Stacks Toggle */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px', background: '#333', borderRadius: 4, border: '1px solid #555'
              }}>
                <span style={{ fontSize: '12px', color: '#ccc' }}>Stacks</span>
                <button
                  role="switch"
                  aria-checked={stacksMode}
                  aria-label="Stacks mode"
                  className={toggleStyles.toggle}
                  onClick={() => {
                    setStacksMode(!stacksMode);
                    setActiveStackId(null);
                    setActiveStackInfo(null);
                    setStackImages([]);
                  }}
                >
                  <span className={toggleStyles.thumb} />
                </button>
              </div>

              {/* Subfolders Toggle */}
              {currentFolder && currentFolder.children && currentFolder.children.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px', background: '#333', borderRadius: 4, border: '1px solid #555'
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
                style={{
                  background: '#333',
                  color: '#eee',
                  border: '1px solid #555',
                  padding: '6px',
                  borderRadius: 4,
                  width: '100%',
                  cursor: 'pointer'
                }}
                disabled={keywordsLoading}
              >
                <option value="">All Keywords</option>
                {keywords.map((kw) => (
                  <option key={kw} value={kw}>
                    {kw}
                  </option>
                ))}
              </select>

              <select
                aria-label="Sort by"
                value={filters.sortBy || 'score_general'}
                onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                style={{
                  background: '#333',
                  color: '#eee',
                  border: '1px solid #555',
                  padding: '6px',
                  borderRadius: 4,
                  width: '100%',
                  cursor: 'pointer'
                }}
              >
                <option value="score_general">General Score</option>
                <option value="created_at">Date Added</option>
                <option value="id">ID</option>
                <option value="score_technical">Technical Score</option>
                <option value="score_aesthetic">Aesthetic Score</option>
                <option value="score_spaq">SPAQ</option>
                <option value="score_ava">AVA</option>
                <option value="score_liqe">LIQE</option>
              </select>

              <select
                aria-label="Sort order"
                value={filters.order || 'DESC'}
                onChange={(e) => setFilters({ ...filters, order: e.target.value as 'ASC' | 'DESC' })}
                style={{
                  background: '#333',
                  color: '#eee',
                  border: '1px solid #555',
                  padding: '6px',
                  borderRadius: 4,
                  width: '100%',
                  cursor: 'pointer'
                }}
              >
                <option value="DESC">Highest First</option>
                <option value="ASC">Lowest First</option>
              </select>
            </div>

            <FilterPanel filters={filters} onChange={setFilters} />

            <div style={{
              flex: 1,
              overflow: 'hidden',
              borderTop: '1px solid #333',
              paddingTop: 10,
              pointerEvents: isInitialGridLoading ? 'none' : 'auto',
              opacity: isInitialGridLoading ? 0.6 : 1,
              transition: 'opacity 0.2s'
            }}>
              {foldersLoading ? <div>Loading folders...</div> : (
                <FolderTree folders={folders} onSelect={handleSelectFolder} selectedId={selectedFolderId} onRefresh={refreshFolders} />
              )}
            </div>
          </div>
        }
        content={
          <div style={{ height: '100%', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {currentView === 'duplicates' ? (
              <DuplicateFinder currentFolder={currentFolder} />
            ) : (
              <>
                {isInitialGridLoading && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 20
                  }}>
                    <div style={{ color: '#aaa' }}>Loading images...</div>
                  </div>
                )}
                {(stackImagesLoading || imagesLoading || stacksLoading) && !isInitialGridLoading && (
                  <div style={{
                    position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', background: 'rgba(0, 0, 0, 0.7)',
                    color: 'white', borderRadius: 20, fontSize: '0.85em', fontWeight: 500
                  }}>
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
                  onFindSimilarImages={handleFindSimilarFromGrid}
                />
                {openingImage && (
                  <ImageViewer
                    image={openingImage}
                    onClose={closeViewer}
                    allImages={currentImages}
                    currentIndex={currentImageIndex}
                    onNavigate={handleNavigateImage}
                    onDelete={handleImageDelete}
                    initialSimilarSearchImageId={initialSimilarSearchImageId}
                    onOpenImageById={openImageById}
                    onOpenFolder={(folderId) => {
                      setSelectedFolderId(folderId);
                      setIncludeSubfolders(false);
                      setActiveStackId(null);
                      setActiveStackInfo(null);
                      setStackImages([]);
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
      <ImportModal
        isOpen={isImportModalOpen}
        folderPath={importFolderPath}
        onClose={() => {
          setIsImportModalOpen(false);
          setImportFolderPath('');
        }}
        onComplete={refreshFolders}
      />
    </>
  );
}

export default AppContent;
