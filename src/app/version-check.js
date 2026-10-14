function compareVersions(a, b) {
    const aParts = String(a || '').split('.').map(Number);
    const bParts = String(b || '').split('.').map(Number);
    const length = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < length; i += 1) {
        const aPart = Number.isFinite(aParts[i]) ? aParts[i] : 0;
        const bPart = Number.isFinite(bParts[i]) ? bParts[i] : 0;
        if (aPart !== bPart) return aPart > bPart ? 1 : -1;
    }
    return 0;
}

// Android must never fall back to web release metadata, including on Play errors.
export async function checkVersionAvailability({ isAndroid, currentVersion, checkPlayUpdate, fetchWebVersion }) {
    if (isAndroid) {
        const info = await checkPlayUpdate();
        const hasUpdate = info?.updateAvailable === true;
        // Play provides availability, not a human-readable version name.
        return { hasUpdate, latestVersion: hasUpdate ? 'Play 스토어 업데이트 가능' : currentVersion };
    }
    const info = await fetchWebVersion();
    if (!info || typeof info.version !== 'string' || !info.version) throw new Error('Invalid web version');
    return { hasUpdate: compareVersions(info.version, currentVersion) > 0, latestVersion: info.version };
}
