import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState, NativeModules } from 'react-native';
import { Button, Spinner, Text, XStack, YStack } from 'tamagui';
import * as Updates from 'expo-updates';
import { checkChannels, describeUpdates } from './client';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';

const Context = createContext<any>(null);
const native = NativeModules.DwcUpdates;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

export function AppUpdatesProvider({ children }) {
    const [state, setState] = useState<any>({ busy: null, checked: false, apk: null, apkReady: false, otaReady: false });
    const busy = useRef(false);
    const lastCheck = useRef(0);
    const pending = Updates.useUpdates().isUpdatePending;

    const check = useCallback(async (automatic = false) => {
        if (busy.current || !native) return;
        busy.current = true;
        lastCheck.current = Date.now();
        setState(previous => ({ ...previous, busy: 'checking' }));
        try {
            const result = await checkChannels(native, Updates);
            setState(previous => ({ ...previous, ...result, checked: true, busy: null,
                apkReady: previous.apkReady && previous.apk?.versionCode === result.apk?.versionCode }));
            // Never reload a working app. Automatic OTA downloads use unmetered data only.
            if (result.otaAvailable && automatic && await native.isUnmetered()) {
                setState(previous => ({ ...previous, busy: 'ota' }));
                try {
                    const downloaded = await Updates.fetchUpdateAsync();
                    setState(previous => ({ ...previous, otaReady: downloaded.isNew || previous.otaReady, otaError: false }));
                } catch (_) { setState(previous => ({ ...previous, otaError: true })); }
            }
        } catch (_) {
            setState(previous => ({ ...previous, otaError: true }));
        } finally {
            busy.current = false;
            setState(previous => ({ ...previous, busy: null }));
        }
    }, []);

    useEffect(() => {
        check(true);
        const subscription = AppState.addEventListener('change', next => {
            if (next === 'active' && Date.now() - lastCheck.current >= CHECK_INTERVAL) check(true);
        });
        return () => subscription.remove();
    }, [check]);

    const downloadApk = async () => {
        if (busy.current) return;
        busy.current = true;
        setState(previous => ({ ...previous, busy: 'apk' }));
        try {
            await native.download();
            setState(previous => ({ ...previous, apkReady: true }));
        } catch (_) {
            Alert.alert('Update unavailable', 'The Android update could not be downloaded or verified. Please try again.');
        } finally {
            busy.current = false;
            setState(previous => ({ ...previous, busy: null }));
        }
    };
    const downloadOta = async () => {
        if (busy.current) return;
        busy.current = true;
        setState(previous => ({ ...previous, busy: 'ota' }));
        try {
            const result = await Updates.fetchUpdateAsync();
            setState(previous => ({ ...previous, otaReady: result.isNew || previous.otaReady, otaError: false }));
        } catch (_) {
            setState(previous => ({ ...previous, otaError: true }));
            Alert.alert('Update unavailable', 'The interface update could not be downloaded. Please try again.');
        } finally {
            busy.current = false;
            setState(previous => ({ ...previous, busy: null }));
        }
    };
    const install = async () => {
        if (busy.current) return;
        busy.current = true;
        try {
            const result = await native.install();
            if (result === 'permission') Alert.alert('Allow app updates', 'Allow FullSend Driver to install updates in Android settings, then return and tap Install update again.');
        } catch (_) {
            Alert.alert('Installation unavailable', 'Please download the Android update again and retry.');
            setState(previous => ({ ...previous, apkReady: false }));
        } finally { busy.current = false; }
    };
    return <Context.Provider value={{ ...state, otaReady: state.otaReady || pending, check, downloadApk, downloadOta, install }}>{children}</Context.Provider>;
}

export function AppUpdatesCard() {
    const updates = useContext(Context);
    const { isOnline } = useAuth();
    const { isTracking } = useLocation();
    if (!updates) return null;
    const applyInterface = () => {
        if (isOnline || isTracking) {
            Alert.alert('Go offline first', 'Switch to Offline in Dash before restarting to apply the update.');
            return;
        }
        Alert.alert('Apply interface update?', 'The app will restart. Your login will be kept.', [
            { text: 'Later', style: 'cancel' },
            { text: 'Restart app', onPress: () => Updates.reloadAsync().catch(() => Alert.alert('Restart unavailable', 'Close and reopen the app to apply the downloaded update.')) },
        ]);
    };
    const installAndroid = () => {
        if (isOnline || isTracking) {
            Alert.alert('Go offline first', 'Switch to Offline in Dash before installing the Android update.');
            return;
        }
        updates.install();
    };
    return <YStack mx='$3' p='$4' gap='$3' borderWidth={1} borderColor='$borderColorWithShadow' borderRadius='$4' testID='app-updates'>
        <XStack justifyContent='space-between' alignItems='center'>
            <Text color='$textPrimary' fontSize='$6' fontWeight='bold'>App updates</Text>
            {!!updates.busy && <Spinner color='$textSecondary' />}
        </XStack>
        <Text color='$textSecondary'>{describeUpdates(updates)}</Text>
        {!!updates.apk && <Button disabled={!!updates.busy} onPress={updates.apkReady ? installAndroid : updates.downloadApk}>
            {updates.apkReady ? 'Install update' : `Download Android ${updates.apk.versionName}`}
        </Button>}
        {updates.otaAvailable && !updates.otaReady && <Button disabled={!!updates.busy} onPress={updates.downloadOta}>Download interface update</Button>}
        {updates.otaReady && <Button disabled={!!updates.busy} onPress={applyInterface}>Apply interface update</Button>}
        <Button disabled={!!updates.busy} onPress={() => updates.check(false)}>Check for updates</Button>
        <Text color='$textSecondary' fontSize='$2'>Interface updates download automatically on Wi-Fi. Android updates require your confirmation.</Text>
    </YStack>;
}
