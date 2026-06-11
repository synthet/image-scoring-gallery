import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { bridge } from '../../bridge';
import type { KeywordCloudEntry } from '../../../electron/types';
import styles from './TagCloud.module.css';

const MIN_FONT = 12;
const MAX_FONT = 38;

export type KeywordCloudKind = 'general' | 'species';

export interface TagCloudProps {
  kind: KeywordCloudKind;
  limit?: number;
  folderId?: number;
  onSelect: (entry: KeywordCloudEntry) => void;
  displayFor?: (entry: KeywordCloudEntry) => string;
  emptyMessage?: string;
}

function defaultDisplay(entry: KeywordCloudEntry): string {
  return (entry.keyword_display?.trim() || entry.keyword_norm || '').trim();
}

function fontSizeFor(count: number, minCount: number, maxCount: number): number {
  if (maxCount <= minCount) return (MIN_FONT + MAX_FONT) / 2;
  const lo = Math.log(minCount + 1);
  const hi = Math.log(maxCount + 1);
  const t = (Math.log(count + 1) - lo) / (hi - lo);
  return Math.round(MIN_FONT + t * (MAX_FONT - MIN_FONT));
}

export function TagCloud({
  kind,
  limit = 200,
  folderId,
  onSelect,
  displayFor = defaultDisplay,
  emptyMessage = 'No keywords yet.',
}: TagCloudProps) {
  const [entries, setEntries] = useState<KeywordCloudEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    void bridge.getKeywordCloud({ kind, limit, folderId })
      .then((rows) => {
        if (!cancelled) {
          setEntries(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setEntries([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [kind, limit, folderId]);

  const { minCount, maxCount } = useMemo(() => {
    if (entries.length === 0) return { minCount: 0, maxCount: 0 };
    let min = Infinity;
    let max = 0;
    for (const e of entries) {
      const c = e.count ?? 0;
      if (c < min) min = c;
      if (c > max) max = c;
    }
    return { minCount: min === Infinity ? 0 : min, maxCount: max };
  }, [entries]);

  if (loading) {
    return (
      <div className={styles.centered}>
        <Loader2 size={20} className={styles.spinner} />
      </div>
    );
  }

  if (error) {
    return <p className={styles.error}>Failed to load keywords.</p>;
  }

  if (entries.length === 0) {
    return <p className={styles.message}>{emptyMessage}</p>;
  }

  return (
    <div className={styles.root}>
      {entries.map((entry) => {
        const label = displayFor(entry);
        const size = fontSizeFor(entry.count ?? 0, minCount, maxCount);
        const countLabel = `${entry.count?.toLocaleString() ?? 0} image${entry.count === 1 ? '' : 's'}`;
        return (
          <button
            key={entry.keyword_norm}
            type="button"
            className={styles.tag}
            title={`${label} · ${countLabel}`}
            style={{ fontSize: `${size}px` }}
            onClick={() => onSelect(entry)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
