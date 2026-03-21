export interface Folder {
    id: number;
    path: string;
    parent_id: number | null;
    is_fully_scored: number;
    image_count: number;
    total_image_count?: number;
    title?: string;
    children?: Folder[];
    indexing_status?: string;
    scoring_status?: string;
    tagging_status?: string;
}

interface FolderRow {
    id: number;
    path: string;
    parent_id: number | null;
    is_fully_scored: number;
    image_count: number;
}

/** Normalize path for matching parent/child rows (DB may omit stale parents). */
function pathKey(p: string): string {
    if (!p) return '';
    let s = p.replace(/\\/g, '/');
    while (s.length > 1 && s.endsWith('/')) {
        s = s.slice(0, -1);
    }
    return s.toLowerCase();
}

function parentPathKey(childKey: string): string | null {
    const i = childKey.lastIndexOf('/');
    if (i < 0) return null;
    if (i === 0) return childKey.length === 1 ? null : '/';
    if (i === 2 && childKey[1] === ':') {
        return `${childKey.slice(0, 2)}/`;
    }
    return childKey.slice(0, i);
}

export function buildFolderTree(folders: FolderRow[]): Folder[] {
    const map = new Map<number, Folder>();
    const roots: Folder[] = [];

    // 1. Create nodes and map
    folders.forEach(f => {
        // Extract folder name from path (Windows or Linux)
        const name = f.path ? f.path.split(/[/\\]/).pop() || f.path : 'Unknown';

        // Skip "." folders or root artifacts if necessary
        if (name === '.') return;

        map.set(f.id, { ...f, title: name, children: [] });
    });

    const pathToId = new Map<string, number>();
    folders.forEach(f => {
        if (!map.has(f.id)) return;
        pathToId.set(pathKey(f.path), f.id);
    });

    // 2. Link parents (path-based fallback when DB parent row is missing or stale)
    folders.forEach(f => {
        const node = map.get(f.id);
        if (!node) return;

        let parentId: number | null = f.parent_id;
        if (parentId != null && !map.has(parentId)) {
            parentId = null;
        }
        if (parentId == null && f.path) {
            const pk = pathKey(f.path);
            const ppk = parentPathKey(pk);
            if (ppk !== null) {
                const byPath = pathToId.get(ppk);
                if (byPath !== undefined && byPath !== f.id) {
                    parentId = byPath;
                }
            }
        }

        if (parentId != null && map.has(parentId)) {
            map.get(parentId)!.children!.push(node);
        } else {
            roots.push(node);
        }
    });

    // 3. Sort children and compute total_image_count
    const processNode = (nodes: Folder[]): number => {
        nodes.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        let totalSum = 0;
        nodes.forEach(n => {
            let childSum = 0;
            if (n.children && n.children.length > 0) {
                childSum = processNode(n.children);
            }
            n.total_image_count = (n.image_count || 0) + childSum;
            totalSum += n.total_image_count;
        });
        return totalSum;
    };

    processNode(roots);
    return roots;
}
