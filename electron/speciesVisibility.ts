/**
 * Keyword table that honours backend species freshness. When the backend has the protected
 * view, generated species keywords whose inputs went stale are hidden exactly as backend
 * readers hide them; older schemas fall back to the raw table.
 */
export async function visibleKeywordsSource(
    query: <T>(sql: string) => Promise<T[]>,
): Promise<string> {
    const capability = await query<{ supported: boolean }>(
        "SELECT to_regclass('public.localization_visible_image_keywords') IS NOT NULL AS supported",
    );
    return capability[0]?.supported === true ? 'localization_visible_image_keywords' : 'image_keywords';
}
