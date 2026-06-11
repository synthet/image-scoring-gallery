import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, Bird, Loader2, Sparkles, Tags } from 'lucide-react';
import type { Folder } from '../Tree/treeUtils';
import type { FilterState } from '../Sidebar/FilterPanel';
import { formatSpeciesLabel, toImageQueryFilters } from '../../utils/keywordFilters';
import { useImages } from '../../hooks/useDatabase';
import { useKeyboardLayer } from '../../hooks/useKeyboardLayer';
import type { ImageRow, KeywordCloudEntry } from '../../../electron/types';
import { GalleryGrid } from '../Gallery/GalleryGrid';
import { TagCloud } from './TagCloud';
import styles from './KeywordsHubPage.module.css';

export type KeywordsTab = 'general' | 'species';

export interface KeywordsHubPageProps {
  currentFolder?: Folder;
  folderIds?: number[];
  includeSubfolders?: boolean;
  filters: FilterState;
  onOpenImage: (id: number, images: ImageRow[]) => void;
  onSemanticSearch?: (query: string) => void;
}

function speciesDisplay(entry: KeywordCloudEntry): string {
  return formatSpeciesLabel(entry.keyword_norm || entry.keyword_display);
}

function generalDisplay(entry: KeywordCloudEntry): string {
  return (entry.keyword_display?.trim() || entry.keyword_norm || '').trim();
}

export function KeywordImagesGrid({
  keyword,
  tab,
  currentFolder,
  folderIds,
  filters,
  onBack,
  onOpenImage,
  onSemanticSearch,
}: {
  keyword: string;
  tab: KeywordsTab;
  currentFolder?: Folder;
  folderIds?: number[];
  filters: FilterState;
  onBack: () => void;
  onOpenImage: (id: number, images: ImageRow[]) => void;
  onSemanticSearch?: (query: string) => void;
}) {
  const imageFilters = useMemo(() => {
    const base = toImageQueryFilters(filters);
    return {
      ...base,
      keyword,
      keywordExact: true,
      ...(folderIds?.length ? { folderIds } : {}),
    };
  }, [filters, keyword, folderIds]);

  const folderId = folderIds?.length ? undefined : currentFolder?.id;
  const { images, loading, loadMore, totalCount } = useImages(50, folderId, imageFilters);

  // Esc returns to the tag cloud, mirroring the back button. Registered at the
  // `page` layer so the image viewer (`drawer`) consumes Esc first when open.
  useKeyboardLayer('page', useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onBack();
      return true;
    }
    return false;
  }, [onBack]));

  const label = tab === 'species' ? formatSpeciesLabel(keyword) : keyword;
  const Icon = tab === 'species' ? Bird : Tags;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.titleToolbar}>
            <div className={styles.titleMain}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={onBack}
                aria-label="Back to tag cloud"
              >
                <ArrowLeft size={14} />
              </button>
              <Icon size={16} className={styles.titleIcon} />
              <h2 className={styles.title}>{label}</h2>
              {!loading && (
                <span className={styles.count}>
                  ({totalCount} {totalCount === 1 ? 'image' : 'images'})
                </span>
              )}
            </div>
            {onSemanticSearch && (
              <button
                type="button"
                className={styles.semanticSearchBtn}
                onClick={() => onSemanticSearch(label)}
                title={`Search for "${label}" with semantic CLIP similarity`}
              >
                <Sparkles size={14} aria-hidden />
                Semantic Search
              </button>
            )}
          </div>
          {keyword !== label && (
            <p className={styles.subtitle} title={keyword}>{keyword}</p>
          )}
        </div>
      </div>
      <div className={styles.bodyGrid}>
        {loading && images.length === 0 && (
          <div className={styles.hero}>
            <Loader2 size={24} className={styles.titleIcon} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}
        {!loading && images.length === 0 && (
          <div className={styles.hero}>
            <p className={styles.heroText}>No images for this keyword.</p>
          </div>
        )}
        {images.length > 0 && (
          <div className={styles.gridWrap}>
            <GalleryGrid
              images={images}
              onSelect={(img) => onOpenImage(img.id, images)}
              onEndReached={loadMore}
              filterEmptyActive={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function KeywordsHubPage({
  currentFolder,
  folderIds,
  filters,
  onOpenImage,
  onSemanticSearch,
}: KeywordsHubPageProps) {
  const [tab, setTab] = useState<KeywordsTab>('general');
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);

  const folderId = folderIds?.length ? undefined : currentFolder?.id;
  const emptyMessage = tab === 'species'
    ? 'No species keywords yet. Run the keywords phase to populate them.'
    : 'No keywords yet. Run the keywords phase to populate them.';

  if (selectedKeyword) {
    return (
      <KeywordImagesGrid
        keyword={selectedKeyword}
        tab={tab}
        currentFolder={currentFolder}
        folderIds={folderIds}
        filters={filters}
        onBack={() => setSelectedKeyword(null)}
        onOpenImage={onOpenImage}
        onSemanticSearch={onSemanticSearch}
      />
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.titleRow}>
            <Tags size={16} className={styles.titleIcon} />
            <h2 className={styles.title}>Keywords</h2>
          </div>
          <p className={styles.subtitle}>
            Keywords sized by image count. Click a tag to view matching images.
          </p>
          <div className={styles.tabs}>
            <button
              type="button"
              className={tab === 'general' ? styles.tabActive : styles.tab}
              onClick={() => setTab('general')}
            >
              Keywords
            </button>
            <button
              type="button"
              className={tab === 'species' ? styles.tabActive : styles.tab}
              onClick={() => setTab('species')}
            >
              Birds
            </button>
          </div>
        </div>
      </div>
      <div className={styles.body}>
        {tab === 'general' ? (
          <TagCloud
            kind="general"
            folderId={folderId}
            onSelect={(entry) => setSelectedKeyword(entry.keyword_norm)}
            displayFor={generalDisplay}
            emptyMessage={emptyMessage}
          />
        ) : (
          <TagCloud
            kind="species"
            folderId={folderId}
            onSelect={(entry) => setSelectedKeyword(entry.keyword_norm)}
            displayFor={speciesDisplay}
            emptyMessage={emptyMessage}
          />
        )}
      </div>
    </div>
  );
}
