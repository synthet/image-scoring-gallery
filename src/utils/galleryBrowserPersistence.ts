import type { FilterState } from '../components/Sidebar/FilterPanel';
import type { Folder } from '../components/Tree/treeUtils';

const STORAGE_KEY = 'driftara.gallery.browserSession.v1';

export type GalleryBrowserPersistedState = {
  v: 1;
  selectedFolderId?: number;
  includeSubfolders: boolean;
  stacksMode: boolean;
  activeStackId: number | null;
  currentView: 'gallery' | 'duplicates' | 'embeddings';
  filters: FilterState;
  smartCoverEnabled: boolean;
};

const DEFAULT_FILTERS: FilterState = {
  minRating: 0,
  sortBy: 'capture_date',
  order: 'DESC',
};

/** Browser / Docker dev UI: persist. Electron renderer: skip (window.electron is set). */
export function isBrowserPersistenceEnabled(): boolean {
  return typeof window !== 'undefined' && !(window as Window & { electron?: unknown }).electron;
}

export function folderIdExistsInTree(folders: Folder[], id: number): boolean {
  const walk = (nodes: Folder[]): boolean => {
    for (const n of nodes) {
      if (n.id === id) return true;
      if (n.children?.length && walk(n.children)) return true;
    }
    return false;
  };
  return walk(folders);
}

function coerceView(v: unknown): 'gallery' | 'duplicates' | 'embeddings' | null {
  if (v === 'gallery' || v === 'duplicates' || v === 'embeddings') return v;
  return null;
}

function coerceFilters(raw: unknown): FilterState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FILTERS };
  const o = raw as Record<string, unknown>;
  const order = o.order === 'ASC' || o.order === 'DESC' ? o.order : DEFAULT_FILTERS.order;
  return {
    minRating: typeof o.minRating === 'number' && o.minRating >= 0 && o.minRating <= 5 ? o.minRating : DEFAULT_FILTERS.minRating,
    colorLabel: typeof o.colorLabel === 'string' ? o.colorLabel : undefined,
    keyword: typeof o.keyword === 'string' ? o.keyword : undefined,
    sortBy: typeof o.sortBy === 'string' ? o.sortBy : DEFAULT_FILTERS.sortBy,
    order,
    capturedDate: typeof o.capturedDate === 'string' ? o.capturedDate : undefined,
  };
}

export function readGalleryBrowserSnapshot(): GalleryBrowserPersistedState | null {
  if (!isBrowserPersistenceEnabled()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const o = parsed as Record<string, unknown>;
    if (o.v !== 1) return null;

    const currentView = coerceView(o.currentView) ?? 'gallery';
    const filters = coerceFilters(o.filters);

    const selectedFolderId =
      typeof o.selectedFolderId === 'number' && Number.isFinite(o.selectedFolderId)
        ? o.selectedFolderId
        : undefined;

    return {
      v: 1,
      selectedFolderId,
      includeSubfolders: Boolean(o.includeSubfolders),
      stacksMode: Boolean(o.stacksMode),
      activeStackId:
        typeof o.activeStackId === 'number' && Number.isFinite(o.activeStackId) ? o.activeStackId : null,
      currentView,
      filters,
      smartCoverEnabled: Boolean(o.smartCoverEnabled),
    };
  } catch {
    return null;
  }
}

export function writeGalleryBrowserSnapshot(state: GalleryBrowserPersistedState): void {
  if (!isBrowserPersistenceEnabled()) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota or private mode */
  }
}
