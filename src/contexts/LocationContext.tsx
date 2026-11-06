import React, { createContext, useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { AppState, Platform } from 'react-native';
import BackgroundGeolocation from '../location/BackgroundLocation';
import { check, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Place, Point } from '@fleetbase/sdk';
import { isEmpty } from '../utils';
import { useAuth } from './AuthContext';
import useStorage from '../hooks/use-storage';
import useFleetbase from '../hooks/use-fleetbase';

const LocationContext = createContext({
    location: null,
    isTracking: false,
    startTracking: () => {},
    stopTracking: () => {},
});

const getLocationPermission = () => (Platform.OS === 'ios' ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);

export const isLocationTrackingAllowed = ({ driver, isOnline, permissionStatus }) => Boolean(driver && isOnline && permissionStatus === RESULTS.GRANTED);

export const LocationProvider = ({ children }) => {
    const { isOnline, driver, trackDriver } = useAuth();
    const { adapter } = useFleetbase();
    const [authToken] = useStorage('_driver_token');
    const [location, setLocation] = useStorage(`${driver?.id ?? 'anon'}_location`, {});
    const [isTracking, setIsTracking] = useState(false);
    const [trackingError, setTrackingError] = useState(null);
    const [permissionStatus, setPermissionStatus] = useState(Platform.OS === 'web' ? RESULTS.GRANTED : RESULTS.DENIED);
    const canTrackLocation = isLocationTrackingAllowed({ driver, isOnline, permissionStatus }) && typeof authToken === 'string' && authToken.length > 0;
    const hasStoredLocation = !isEmpty(location);

    // Keep native tracking synchronized with permission changes made in Settings.
    useEffect(() => {
        if (Platform.OS === 'web') return;

        let isMounted = true;
        const refreshPermissionStatus = async () => {
            const status = await check(getLocationPermission());
            if (isMounted) {
                setPermissionStatus(status);
            }
        };

        refreshPermissionStatus();
        const subscription = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                refreshPermissionStatus();
            }
        });

        return () => {
            isMounted = false;
            subscription.remove();
        };
    }, []);

    const onLocationError = useCallback((error) => {
        const code = typeof error?.code === 'string' ? error.code : 'LOCATION_UNAVAILABLE';
        setTrackingError(code);
        if (Platform.OS !== 'android' || (code !== 'LOCATION_UPLOAD_UNAVAILABLE' && code !== 'LOCATION_TIMEOUT' && code !== 'LOCATION_UNAVAILABLE')) setIsTracking(false);
        console.warn('[Location] update unavailable');
    }, []);

    // Manually track location
    const trackLocation = useCallback(async () => {
        if (!canTrackLocation) return;

        try {
            const location = await BackgroundGeolocation.getCurrentPosition({
                samples: 3,
                desiredAccuracy: 1,
                extras: {
                    event: 'getCurrentPosition',
                },
            });
            setLocation(location);
            trackDriver(location.coords);
        } catch (error) {
            onLocationError(error);
        }
    }, [canTrackLocation, trackDriver, setLocation, onLocationError]);

    // Get the drivers location as a Place
    const getDriverLocationAsPlace = useCallback(
        (attributes = {}) => {
            const { coords } = location;

            return new Place(
                {
                    id: 'driver',
                    name: 'Driver Location',
                    street1: 'Driver Location',
                    location: new Point(coords.latitude, coords.longitude),
                    ...attributes,
                },
                adapter
            );
        },
        [location, adapter]
    );

    // Get the HTTP configuration for background geolocation tracking
    const getHttpConfig = useCallback(() => {
        if (!adapter || !driver?.id || !authToken) return {};

        return {
            url: `${adapter.host}/${adapter.namespace}/drivers/${driver.id}/track`,
            headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
                'User-Agent': '@fleetbase/navigator-app',
            },
            httpRootProperty: '.',
            locationTemplate:
                '{"latitude":<%= latitude %>,"longitude":<%= longitude %>,"heading":<%= heading %>,"speed":<%= speed %>,"altitude":<%= altitude %>,"timestamp":"<%= timestamp %>","activity":"<%= activity.type %>","is_moving":<%= is_moving %>,"battery":{"level":<%= battery.level %>,"is_charging":<%= battery.is_charging %>}}',
        };
    }, [adapter, driver?.id, authToken]);

    // Callback to handle location updates.
    const onLocation = useCallback(
        (location) => {
            setLocation(location);
            setTrackingError((current) => ['LOCATION_TIMEOUT', 'LOCATION_UNAVAILABLE'].includes(current) ? null : current);
        },
        [setLocation]
    );

    // Callback to handle activity updates.
    const onMotionChange = useCallback(
        (event) => {
            if (event.location) {
                onLocation(event.location);
            }
        },
        [onLocation]
    );

    // Function to start tracking.
    const startTracking = useCallback(() => {
        if (!canTrackLocation) return;

        setTrackingError(null);
        BackgroundGeolocation.start(() => {
            setIsTracking(true);
        }, onLocationError);
    }, [canTrackLocation, onLocationError]);

    // Function to stop tracking.
    const stopTracking = useCallback(() => {
        BackgroundGeolocation.stop(() => {
            setIsTracking(false);
            setTrackingError(null);
            console.log('[BackgroundGeolocation] Tracking stopped');
        });
    }, []);

    useEffect(() => {
        if (!canTrackLocation) {
            stopTracking();
            return;
        }

        let isActive = true;
        const subscriptions = [];

        BackgroundGeolocation.ready(
            {
                backgroundPermissionRationale: {
                    title: 'Allow Fleetbase Navigator to access your location',
                    message:
                        'Fleetbase Navigator collects precise location data to enable real-time driver tracking and order progress updates for your organization’s dispatchers and operations team, while the app is minimized and you are online. Android displays a location-sharing notification. After force-stop or restart, reopen the app to resume.',
                    positiveAction: 'Allow',
                    negativeAction: 'Deny',
                },
                desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
                distanceFilter: 10,
                stopOnTerminate: true,
                startOnBoot: false,
                stopTimeout: 1,
                debug: false,
                ...getHttpConfig(),
            },
            (state) => {
                console.log('[BackgroundGeolocation] is ready:', state);
                if (isActive) {
                    startTracking();
                }
            },
            onLocationError
        );

        // Subscribe to location events.
        subscriptions.push(BackgroundGeolocation.onLocation(onLocation, onLocationError));

        // Subscribe to motion and activity events.
        subscriptions.push(BackgroundGeolocation.onMotionChange(onMotionChange));
        if (BackgroundGeolocation.onUpload) subscriptions.push(BackgroundGeolocation.onUpload(() => setTrackingError(null)));

        // Clean up the listener when unmounting.
        return () => {
            isActive = false;
            subscriptions.forEach((subscription) => subscription?.remove?.());
        };
    }, [canTrackLocation, onLocation, onLocationError, onMotionChange, getHttpConfig, startTracking, stopTracking]);

    // The native foreground service owns periodic updates, including when JS
    // is suspended. A first current fix keeps the existing map immediately useful.
    useEffect(() => {
        if (canTrackLocation && !hasStoredLocation) trackLocation();
    }, [canTrackLocation, hasStoredLocation, trackLocation]);

    // Memoize the context value to prevent unnecessary re-renders.
    const value = useMemo(
        () => ({ location, isTracking, trackingError, permissionStatus, startTracking, stopTracking, getDriverLocationAsPlace, trackLocation }),
        [location, isTracking, trackingError, permissionStatus, startTracking, stopTracking, getDriverLocationAsPlace, trackLocation]
    );

    return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

// Custom hook to use the LocationContext.
export const useLocation = () => {
    const context = useContext(LocationContext);
    if (context === undefined) {
        throw new Error('useLocation must be used within a LocationProvider');
    }
    return context;
};
