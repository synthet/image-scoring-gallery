import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Trash2 } from 'lucide-react';
import type { Folder as FolderType } from './treeUtils';
import { ConfirmDialog } from '../Shared/ConfirmDialog';
import { bridge } from '../../bridge';
import { STAGE_DISPLAY } from '../../constants/pipelineLabels';

const STATUS_COLOR: Record<string, string> = {
    not_started: '#555',
    queued: '#888',
    running: '#4a9eff',
    done: '#4caf50',
    skipped: '#f0a500',
    failed: '#e05050',
};

const PHASE_LABELS: [keyof Pick<FolderType, 'indexing_status' | 'scoring_status' | 'tagging_status'>, string][] = [
    ['indexing_status', STAGE_DISPLAY.indexing.name],
    ['scoring_status', STAGE_DISPLAY.scoring.name],
    ['tagging_status', STAGE_DISPLAY.keywords.name],
];

interface FolderTreeProps {
    folders: FolderType[];
    onSelect: (folder: FolderType) => void;
    selectedId?: number;
    onRefresh?: () => void;
}

const TreeNode: React.FC<{ node: FolderType; onSelect: (f: FolderType) => void; selectedId?: number; depth: number; onRefresh?: () => void }> = ({ node, onSelect, selectedId, depth, onRefresh }) => {
    const [expanded, setExpanded] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = node.id === selectedId;

    useEffect(() => {
        if (!selectedId || !hasChildren || expanded) return;

        const hasSelectedDescendant = (n: FolderType, targetId: number): boolean => {
            if (!n.children) return false;
            return n.children.some(c => c.id === targetId || hasSelectedDescendant(c, targetId));
        };

        if (node.children!.some(c => c.id === selectedId || hasSelectedDescendant(c, selectedId))) {
            setExpanded(true);
        }
    }, [selectedId, node.children, hasChildren, expanded]);

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(!expanded);
    };

    const handleClick = () => {
        onSelect(node);
    };

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        setIsDeleteDialogOpen(false);
        const success = await bridge.deleteFolder(node.id);
        if (success && onRefresh) {
            onRefresh();
        }
    };

    return (
        <div>
            <div
                onClick={handleClick}
                onDoubleClick={handleToggle}
                style={{
                    paddingLeft: depth * 16 + 4,
                    paddingRight: 8,
                    paddingTop: 4,
                    paddingBottom: 4,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: isSelected ? '#37373d' : 'transparent',
                    color: isSelected ? '#fff' : '#ccc',
                    userSelect: 'none'
                }}
                className="hover:bg-gray-800"
            >
                <span onClick={handleToggle} style={{ marginRight: 4, cursor: 'pointer', opacity: hasChildren ? 1 : 0 }}>
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>

                <span style={{ marginRight: 6, color: isSelected ? '#61dafb' : '#e8bf6a' }}>
                    {expanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                </span>

                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>
                    {node.title}
                </span>

                {PHASE_LABELS.some(([field]) => node[field] && node[field] !== 'not_started') && (
                    <span style={{ display: 'flex', gap: 2, marginRight: 4 }}>
                        {PHASE_LABELS.map(([field, label]) => {
                            const status = node[field] ?? 'not_started';
                            return (
                                <span
                                    key={field}
                                    title={`${label}: ${status}`}
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        backgroundColor: STATUS_COLOR[status] ?? STATUS_COLOR.not_started,
                                        display: 'inline-block',
                                        flexShrink: 0,
                                    }}
                                />
                            );
                        })}
                    </span>
                )}

                {node.total_image_count === 0 && (
                    <button
                        onClick={handleDeleteClick}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#e06c75',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                        title="Remove Empty Folder from DB"
                    >
                        <Trash2 size={14} />
                    </button>
                )}
            </div>

            {expanded && hasChildren && (
                <div>
                    {node.children!.map(child => (
                        <TreeNode key={child.id} node={child} onSelect={onSelect} selectedId={selectedId} depth={depth + 1} onRefresh={onRefresh} />
                    ))}
                </div>
            )}

            <ConfirmDialog
                isOpen={isDeleteDialogOpen}
                title="Remove Folder"
                message={`Are you sure you want to remove the database folder "${node.title}"?\nThis won't delete files on disk.`}
                confirmLabel="Remove"
                cancelLabel="Cancel"
                variant="danger"
                onConfirm={handleDeleteConfirm}
                onCancel={() => setIsDeleteDialogOpen(false)}
            />
        </div>
    );
};

export const FolderTree: React.FC<FolderTreeProps> = ({ folders, onSelect, selectedId, onRefresh }) => {
    return (
        <div style={{ overflowX: 'hidden', overflowY: 'auto', height: '100%' }}>
            {folders.map(root => (
                <TreeNode key={root.id} node={root} onSelect={onSelect} selectedId={selectedId} depth={0} onRefresh={onRefresh} />
            ))}
        </div>
    );
};
