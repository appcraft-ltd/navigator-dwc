// Keep APK and OTA failures independent: either channel can remain usable offline.
export async function checkChannels(native, ota) {
    const [apk, interfaceUpdate] = await Promise.allSettled([
        native.check(),
        ota.isEnabled ? ota.checkForUpdateAsync() : Promise.resolve({ isAvailable: false }),
    ]);
    return {
        apk: apk.status === 'fulfilled' ? apk.value : null,
        apkError: apk.status === 'rejected',
        otaAvailable: interfaceUpdate.status === 'fulfilled' && interfaceUpdate.value.isAvailable,
        otaError: !ota.isEnabled || interfaceUpdate.status === 'rejected',
    };
}

export function describeUpdates({ busy, apk, apkReady, otaReady, otaAvailable, apkError, otaError, checked }) {
    if (busy === 'checking') return 'Checking for updates…';
    if (busy === 'apk') return 'Downloading and verifying the Android update…';
    if (busy === 'ota') return 'Downloading the interface update…';
    if (apkReady) return 'Android update ready. Tap Install update to continue.';
    if (apk) return `Android ${apk.versionName} is available.`;
    if (otaReady) return 'Interface update downloaded. It will apply the next time the app starts.';
    if (otaAvailable) return 'An interface update is available.';
    if (apkError || otaError) return 'Some updates could not be checked. Check your connection and try again.';
    if (checked) return 'You’re up to date.';
    return 'Check for Android and interface updates.';
}
