/** Backend migration 0043 owns projection semantics; the renderer shape stays stable. */
export function birdBboxSelect(preferNormalized: boolean): string {
    if (!preferNormalized) return 'i.bird_bbox';
    return '(SELECT compat.bird_bbox FROM image_bird_bbox_compat compat WHERE compat.image_id = i.id) AS bird_bbox';
}
