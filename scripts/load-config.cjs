/**
 * Load config.json merged with environment.json (same rules as electron/config.ts).
 * Used by Node scripts under scripts/ that are not bundled with Electron.
 */
const fs = require('fs');
const path = require('path');

function isRecord(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(target, source) {
    const out = { ...target };
    for (const [key, value] of Object.entries(source)) {
        if (isRecord(value) && isRecord(out[key])) {
            out[key] = deepMerge(out[key], value);
        } else {
            out[key] = value;
        }
    }
    return out;
}

/**
 * @param {string} projectRoot Absolute path to gallery repo root (directory containing config.json).
 * @returns {Record<string, unknown>}
 */
function loadMergedConfig(projectRoot) {
    const configPath = path.join(projectRoot, 'config.json');
    const envPath = path.join(projectRoot, 'environment.json');
    let base = {};
    if (fs.existsSync(configPath)) {
        base = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    let env = {};
    if (fs.existsSync(envPath)) {
        env = JSON.parse(fs.readFileSync(envPath, 'utf8'));
    }
    if (!isRecord(base)) base = {};
    if (!isRecord(env)) env = {};
    return deepMerge(base, env);
}

module.exports = { loadMergedConfig, deepMerge };
