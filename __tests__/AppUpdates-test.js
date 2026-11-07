import { checkChannels, describeUpdates } from '../src/updates/client';

const release = { versionName: '0.1.3', versionCode: 4, size: 50 };
const fail = () => Promise.reject(new Error('Offline'));
test('both update channels can report an update independently', async () => {
    const result = await checkChannels({ check: async () => release }, { isEnabled: true, checkForUpdateAsync: async () => ({ isAvailable: true }) });
    expect(result).toEqual({ apk: release, apkError: false, otaAvailable: true, otaError: false });
});
test('an APK check failure does not hide a compatible OTA update', async () => {
    const result = await checkChannels({ check: fail }, { isEnabled: true, checkForUpdateAsync: async () => ({ isAvailable: true }) });
    expect(result.apkError).toBe(true);
    expect(result.otaAvailable).toBe(true);
});
test('an OTA failure does not hide an Android release', async () => {
    const result = await checkChannels({ check: async () => release }, { isEnabled: true, checkForUpdateAsync: fail });
    expect(result.apk).toBe(release);
    expect(result.otaError).toBe(true);
});
test('a disabled OTA client is not reported as fully up to date', async () => {
    const result = await checkChannels({ check: async () => null }, { isEnabled: false });
    expect(describeUpdates({ ...result, checked: true })).toContain('could not be checked');
});
test('a verified APK has a clear install state', () => {
    expect(describeUpdates({ apk: release, apkReady: true })).toContain('Install update');
    expect(describeUpdates({ apk: release })).toContain('0.1.3');
});
test('a downloaded interface update waits for the next app start', () => {
    expect(describeUpdates({ otaReady: true })).toContain('next time the app starts');
});
test('offline errors cannot produce an up-to-date status', () => {
    expect(describeUpdates({ checked: true, apkError: true })).toContain('could not be checked');
    expect(describeUpdates({ checked: true })).toBe('You’re up to date.');
});
