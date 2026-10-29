/** Backend migration 0043 owns projection semantics; the renderer shape stays stable. */
export function birdBboxSelect(preferNormalized: boolean): string {
    if (!preferNormalized) return 'i.bird_bbox';
    return '(SELECT compat.bird_bbox FROM image_bird_bbox_compat compat WHERE compat.image_id = i.id) AS bird_bbox';
}

/** Resolve capability per request; read the control inside the image query's snapshot. */
export async function protectedBirdBboxSelect(
    preferNormalized: boolean,
    query: <T>(sql: string) => Promise<T[]>,
): Promise<string> {
    if (preferNormalized) return birdBboxSelect(true);
    const capability = await query<{ supported: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' " +
        "AND table_name='localization_authority_control' AND column_name='selection_freshness_enabled') AS supported",
    );
    if (capability[0]?.supported !== true) return birdBboxSelect(false);
    return 'CASE WHEN COALESCE((SELECT selection_freshness_enabled FROM localization_authority_control WHERE id=1), TRUE) ' +
        'THEN (SELECT compat.bird_bbox FROM image_bird_bbox_compat compat WHERE compat.image_id=i.id) ' +
        'ELSE i.bird_bbox END AS bird_bbox';
}
