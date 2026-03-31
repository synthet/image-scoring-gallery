/** Stable synthetic DB-like id for filesystem paths (negative to avoid real DB collisions). */
export function fsPathToSyntheticId(filePath: string): number {
    let h = 2166136261;
    for (let i = 0; i < filePath.length; i++) {
        h ^= filePath.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const n = h | 0;
    return n <= 0 ? n : -Math.abs(n);
}

export interface FsImageRow {
    id: number;
    file_path: string;
    file_name: string;
    score_general: number;
    score_technical: number;
    score_aesthetic: number;
    score_spaq: number;
    score_ava: number;
    score_liqe: number;
    rating: number;
    label: string | null;
}

export function mapFsEntryToImageRow(fullPath: string, fileName: string): FsImageRow {
    const name =
        (fileName?.trim() ||
            fullPath
                .replace(/[/\\]+$/, '')
                .split(/[/\\]/)
                .pop() ||
            '').trim() || 'image';
    return {
        id: fsPathToSyntheticId(fullPath),
        file_path: fullPath,
        file_name: name,
        score_general: 0,
        score_technical: 0,
        score_aesthetic: 0,
        score_spaq: 0,
        score_ava: 0,
        score_liqe: 0,
        rating: 0,
        label: null,
    };
}
