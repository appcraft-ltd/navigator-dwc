import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Alert, NativeModules, Text } from 'react-native';

const mockNative = {
    check: jest.fn(), download: jest.fn(), install: jest.fn(), isUnmetered: jest.fn(),
};
let mockAuth = { isOnline: false };
let mockLocation = { isTracking: false };
jest.mock('../src/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../src/contexts/LocationContext', () => ({ useLocation: () => mockLocation }));
jest.mock('expo-updates', () => ({
    isEnabled: true, checkForUpdateAsync: jest.fn(), fetchUpdateAsync: jest.fn(), reloadAsync: jest.fn(),
    useUpdates: () => ({ isUpdatePending: false }),
}));
jest.mock('tamagui', () => {
    const { View, Text } = require('react-native');
    return { Text, XStack: View, YStack: View, Spinner: View, Button: View };
});
NativeModules.DwcUpdates = mockNative;
const { AppUpdatesProvider, AppUpdatesCard } = require('../src/updates/AppUpdates.android');
const Updates = require('expo-updates');
const text = screen => screen.root.findAllByType(Text).map(n => n.props.children).flat().join(' ');
const button = (screen, label) => screen.root.findAll(n => n.props.onPress && n.props.children === label)[0];
let screen;
beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { isOnline: false }; mockLocation = { isTracking: false };
    mockNative.check.mockResolvedValue(null);
    mockNative.download.mockResolvedValue(null);
    mockNative.install.mockResolvedValue('installer');
    mockNative.isUnmetered.mockResolvedValue(true);
    Updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    Updates.fetchUpdateAsync.mockResolvedValue({ isNew: true });
    Updates.reloadAsync.mockResolvedValue(null);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => { if (screen) await act(async () => screen.unmount()); screen = null; });
async function mount() { await act(async () => { screen = Renderer.create(<AppUpdatesProvider><AppUpdatesCard /></AppUpdatesProvider>); }); }
test('automatic Wi-Fi download never reloads a working app', async () => {
    await mount();
    expect(Updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
    expect(text(screen)).toContain('next time the app starts');
});
test('automatic checks do not download interface assets on metered data', async () => {
    mockNative.isUnmetered.mockResolvedValue(false);
    await mount();
    expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
    await act(async () => button(screen, 'Download interface update').props.onPress());
    expect(Updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
});
test('an online driver cannot apply an interface update', async () => {
    mockAuth.isOnline = true;
    await mount();
    await act(async () => button(screen, 'Apply interface update').props.onPress());
    expect(Alert.alert).toHaveBeenLastCalledWith('Go offline first', expect.any(String));
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
});
test('an offline driver explicitly confirms applying an interface update', async () => {
    await mount();
    await act(async () => button(screen, 'Apply interface update').props.onPress());
    const actions = Alert.alert.mock.calls.at(-1)[2];
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
    await act(async () => actions.find(action => action.text === 'Restart app').onPress());
    expect(Updates.reloadAsync).toHaveBeenCalledTimes(1);
});
test('APK download is explicit and installation stays blocked while tracking', async () => {
    Updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    mockNative.check.mockResolvedValue({ versionCode: 4, versionName: '0.1.3' });
    mockLocation.isTracking = true;
    await mount();
    expect(mockNative.download).not.toHaveBeenCalled();
    await act(async () => button(screen, 'Download Android 0.1.3').props.onPress());
    await act(async () => button(screen, 'Install update').props.onPress());
    expect(mockNative.install).not.toHaveBeenCalled();
    mockLocation.isTracking = false;
    await act(async () => screen.update(<AppUpdatesProvider><AppUpdatesCard /></AppUpdatesProvider>));
    await act(async () => button(screen, 'Install update').props.onPress());
    expect(mockNative.install).toHaveBeenCalledTimes(1);
});
