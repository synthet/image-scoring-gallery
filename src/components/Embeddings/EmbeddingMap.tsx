import React from 'react';

export interface ProjectedEmbeddingPoint {
  id: number;
  x: number;
  y: number;
  fileName?: string;
  thumbnailPath?: string;
  color?: string;
  stackId?: number | null;
}

interface EmbeddingMapProps {
  points: ProjectedEmbeddingPoint[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelectPoint?: (point: ProjectedEmbeddingPoint) => void;
}

/**
 * Placeholder scaffold for the future 2D embeddings map.
 *
 * This component intentionally focuses on basic state handling and a
 * stable props contract so backend integration can be added incrementally.
 */
export const EmbeddingMap: React.FC<EmbeddingMapProps> = ({
  points,
  isLoading = false,
  error = null,
  onRetry,
  onSelectPoint,
}) => {
  if (isLoading) {
    return (
      <div style={{ padding: 24, color: '#aaa' }}>
        Loading embedding map projection…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: '#ff6b6b', marginBottom: 12 }}>Failed to load embedding map: {error}</div>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid #555',
              background: '#2d2d2d',
              color: '#e5e5e5',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!points.length) {
    return (
      <div style={{ padding: 24, color: '#aaa' }}>
        No projected points available yet. Run embedding + projection jobs to populate this view.
      </div>
    );
  }

  return (
    <div style={{ padding: 20, height: '100%', overflow: 'auto' }}>
      <div style={{ marginBottom: 10, color: '#aaa' }}>
        Embedding map placeholder ({points.length} points)
      </div>
      <div
        style={{
          border: '1px dashed #555',
          borderRadius: 8,
          minHeight: 320,
          padding: 16,
          background: '#1c1c1c',
        }}
      >
        <div style={{ marginBottom: 12, color: '#888', fontSize: '0.9em' }}>
          Rendering scaffold only. WebGL/canvas plotting will be added in a follow-up.
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {points.slice(0, 50).map((point) => (
            <li key={point.id}>
              <button
                onClick={() => onSelectPoint?.(point)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: '1px solid #3a3a3a',
                  background: '#252526',
                  color: '#ddd',
                  borderRadius: 6,
                  padding: '8px 10px',
                  cursor: onSelectPoint ? 'pointer' : 'default',
                }}
              >
                #{point.id} · ({point.x.toFixed(3)}, {point.y.toFixed(3)}){point.fileName ? ` · ${point.fileName}` : ''}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
