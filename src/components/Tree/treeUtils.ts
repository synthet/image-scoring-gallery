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

    // 2. Link parents
    folders.forEach(f => {
        const node = map.get(f.id);
        if (!node) return;

        if (f.parent_id && map.has(f.parent_id)) {
            map.get(f.parent_id)!.children!.push(node);
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
