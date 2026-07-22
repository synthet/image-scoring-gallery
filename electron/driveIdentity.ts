/**
 * Stable identity for an external/removable drive so Sync and Backup can
 * recognize the same physical volume across sessions (and across drive-letter
 * changes).
 *
 * Identity preference: hardware **disk serial** when available, else the
 * **volume serial** (`VOL-<serial>`). Cheap USB card readers frequently report
 * a blank/all-zero disk serial, so we fall back to the per-format volume serial
 * in that case. When neither is resolvable (or off-Windows), we degrade to a
 * path-derived id so callers still work — it just won't be shared across mounts.
 *
 * The Windows lookup shells out to PowerShell once per drive letter per session;
 * all parsing/derivation is factored into pure helpers so it is unit-testable
 * without spawning a process.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';

export interface DriveIdentity {
    /** Stable key used to look up per-drive session state. */
    driveId: string;
    diskSerial?: string;
    volumeSerial?: string;
    volumeLabel?: string;
    fsType?: string;
    /** How `driveId` was derived — for logging/telemetry. */
    source: 'disk-serial' | 'volume-serial' | 'path-fallback';
}

/** Raw shape emitted by the PowerShell probe (before normalization). */
interface VolumeProbe {
    volumeSerial?: string | null;
    diskSerial?: string | null;
    label?: string | null;
    fs?: string | null;
}

/** Serials that hardware/readers report as "no real serial". Treated as absent. */
const BLANK_SERIAL = /^0*$/;

/** Normalize a serial: trim, strip inner whitespace, upper-case; drop blanks/all-zero/"none". */
export function normalizeSerial(raw: string | null | undefined): string | undefined {
    if (raw == null) return undefined;
    const s = String(raw).trim().replace(/\s+/g, '').toUpperCase();
    if (!s || s === 'NONE' || BLANK_SERIAL.test(s)) return undefined;
    return s;
}

/**
 * Pure driveId derivation: disk serial wins, else `VOL-<volumeSerial>`.
 * Returns null when neither serial is usable (caller falls back to a path id).
 */
export function computeDriveId(
    diskSerialRaw?: string | null,
    volumeSerialRaw?: string | null,
): { driveId: string; source: DriveIdentity['source'] } | null {
    const disk = normalizeSerial(diskSerialRaw);
    if (disk) return { driveId: disk, source: 'disk-serial' };
    const vol = normalizeSerial(volumeSerialRaw);
    if (vol) return { driveId: `VOL-${vol}`, source: 'volume-serial' };
    return null;
}

/** Extract the `E:` drive-letter root from a mount path; null if not a drive-letter path. */
export function driveLetterOf(mountPath: string): string | null {
    const m = /^([A-Za-z]):/.exec(mountPath);
    return m ? `${m[1].toUpperCase()}:` : null;
}

/** Last-resort identity keyed by the mount path (not shared across drive letters). */
export function pathFallbackIdentity(key: string): DriveIdentity {
    const norm = key.replace(/[\\/]+$/, '').toUpperCase();
    return { driveId: `PATH-${norm}`, source: 'path-fallback' };
}

/**
 * Pure: turn the PowerShell probe's JSON + a fallback key into a DriveIdentity.
 * Exported for unit tests (no process spawn required).
 */
export function parseVolumeProbe(rawJson: string, fallbackKey: string): DriveIdentity {
    let probe: VolumeProbe;
    try {
        probe = JSON.parse(rawJson) as VolumeProbe;
    } catch {
        return pathFallbackIdentity(fallbackKey);
    }
    const computed = computeDriveId(probe.diskSerial, probe.volumeSerial);
    if (!computed) return pathFallbackIdentity(fallbackKey);
    return {
        driveId: computed.driveId,
        source: computed.source,
        diskSerial: normalizeSerial(probe.diskSerial),
        volumeSerial: normalizeSerial(probe.volumeSerial),
        volumeLabel: probe.label ?? undefined,
        fsType: probe.fs ?? undefined,
    };
}

/** PowerShell that probes a single drive letter and emits compact JSON. */
function volumeProbeScript(letter: string): string {
    return [
        "$ErrorActionPreference='SilentlyContinue'",
        `$d='${letter}'`,
        '$out=[ordered]@{volumeSerial=$null;diskSerial=$null;label=$null;fs=$null}',
        'try{$ld=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID=\'$($d):\'";' +
            'if($ld){$out.volumeSerial=$ld.VolumeSerialNumber;$out.label=$ld.VolumeName;$out.fs=$ld.FileSystem}}catch{}',
        'try{$disk=Get-Partition -DriveLetter $d -ErrorAction Stop | Get-Disk -ErrorAction Stop;' +
            'if($disk){$out.diskSerial=($disk.SerialNumber | Select-Object -First 1)}}catch{}',
        '$out | ConvertTo-Json -Compress',
    ].join(';');
}

/** Run the PowerShell probe for one drive letter (e.g. "E"). Rejects on spawn/timeout error. */
function runVolumeProbe(letter: string): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', volumeProbeScript(letter)],
            { timeout: 10_000, windowsHide: true },
            (err, stdout) => {
                if (err) reject(err);
                else resolve(stdout.trim());
            },
        );
    });
}

/** In-session cache keyed by drive letter (or mount path off-Windows). */
const identityCache = new Map<string, DriveIdentity>();

/** Clear the in-session identity cache (tests / drive re-insertion). */
export function resetDriveIdentityCache(): void {
    identityCache.clear();
}

/**
 * Resolve a stable {@link DriveIdentity} for a mount path. Windows uses a
 * PowerShell probe; everything else (and any failure) degrades to a path id.
 * Results are cached for the session.
 */
export async function resolveDriveId(mountPath: string): Promise<DriveIdentity> {
    const letter = driveLetterOf(mountPath);
    const cacheKey = letter ?? path.resolve(mountPath);
    const cached = identityCache.get(cacheKey);
    if (cached) return cached;

    let identity: DriveIdentity;
    if (process.platform === 'win32' && letter) {
        try {
            const raw = await runVolumeProbe(letter[0]);
            identity = parseVolumeProbe(raw, cacheKey);
        } catch {
            identity = pathFallbackIdentity(cacheKey);
        }
    } else {
        identity = pathFallbackIdentity(cacheKey);
    }

    identityCache.set(cacheKey, identity);
    return identity;
}
