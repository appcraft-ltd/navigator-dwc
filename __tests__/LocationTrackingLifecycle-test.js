import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { View } from 'react-native';
import BackgroundGeolocation from '../src/location/BackgroundLocation';
import { check, RESULTS } from 'react-native-permissions';
import { LocationProvider, isLocationTrackingAllowed, useLocation } from '../src/contexts/LocationContext';

let mockAuthState;
const mockSetLocation = jest.fn();
const mockAdapter = { host: 'https://api.fleetbase.io', namespace: 'fleet-ops/v1' };

jest.mock('react-native-permissions', () => ({
    check: jest.fn(),
    PERMISSIONS: {
        ANDROID: { ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION' },
        IOS: { LOCATION_WHEN_IN_USE: 'ios.permission.LOCATION_WHEN_IN_USE' },
    },
    RESULTS: { DENIED: 'denied', BLOCKED: 'blocked', GRANTED: 'granted' },
}));

jest.mock('../src/location/BackgroundLocation', () => ({
    __esModule: true,
    default: {
        DESIRED_ACCURACY_HIGH: 1,
        getCurrentPosition: jest.fn(),
        onLocation: jest.fn(() => ({ remove: jest.fn() })),
        onMotionChange: jest.fn(() => ({ remove: jest.fn() })),
        onUpload: jest.fn(() => ({ remove: jest.fn() })),
        ready: jest.fn((config, callback) => callback({ enabled: false })),
        start: jest.fn((callback) => callback()),
        stop: jest.fn((callback) => callback()),
    },
}));

jest.mock('@fleetbase/sdk', () => ({
    Place: class Place {},
    Point: class Point {},
}));

jest.mock('../src/contexts/AuthContext', () => ({
    useAuth: () => mockAuthState,
}));

jest.mock('../src/hooks/use-storage', () => (key) => [key === '_driver_token' ? 'session-token' : {}, mockSetLocation]);
jest.mock('../src/hooks/use-fleetbase', () => () => ({ adapter: mockAdapter }));
jest.mock('../src/utils', () => ({
    isEmpty: (value) => !value || Object.keys(value).length === 0,
}));

let latestLocationState;
const LocationProbe = () => { latestLocationState = useLocation(); return <View />; };
const driver = { id: 'driver-1' };
const renderProvider = () => (
    <LocationProvider>
        <LocationProbe />
    </LocationProvider>
);

describe('location tracking lifecycle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.defineProperty(require('react-native').Platform, 'OS', { configurable: true, value: 'android' });
        mockAuthState = { driver, isOnline: true, trackDriver: jest.fn() };
        check.mockResolvedValue(RESULTS.GRANTED);
        BackgroundGeolocation.getCurrentPosition.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    });

    test('requires a driver, online state, and granted permission', () => {
        expect(isLocationTrackingAllowed({ driver, isOnline: true, permissionStatus: RESULTS.GRANTED })).toBe(true);
        expect(isLocationTrackingAllowed({ driver: null, isOnline: true, permissionStatus: RESULTS.GRANTED })).toBe(false);
        expect(isLocationTrackingAllowed({ driver, isOnline: false, permissionStatus: RESULTS.GRANTED })).toBe(false);
        expect(isLocationTrackingAllowed({ driver, isOnline: true, permissionStatus: RESULTS.DENIED })).toBe(false);
    });

    test('starts native geolocation only for an authenticated online driver with permission', async () => {
        await ReactTestRenderer.act(async () => {
            ReactTestRenderer.create(renderProvider());
        });

        expect(BackgroundGeolocation.ready).toHaveBeenCalled();
        expect(BackgroundGeolocation.start).toHaveBeenCalled();
    });

    test('does not initialize tracking when permission is denied', async () => {
        check.mockResolvedValue(RESULTS.DENIED);

        await ReactTestRenderer.act(async () => {
            ReactTestRenderer.create(renderProvider());
        });

        expect(BackgroundGeolocation.ready).not.toHaveBeenCalled();
        expect(BackgroundGeolocation.start).not.toHaveBeenCalled();
        expect(BackgroundGeolocation.stop).toHaveBeenCalled();
    });

    test('stops geolocation when the driver goes offline or logs out', async () => {
        let renderer;
        await ReactTestRenderer.act(async () => {
            renderer = ReactTestRenderer.create(renderProvider());
        });

        jest.clearAllMocks();
        mockAuthState = { ...mockAuthState, isOnline: false };
        await ReactTestRenderer.act(async () => {
            renderer.update(renderProvider());
        });

        expect(BackgroundGeolocation.stop).toHaveBeenCalled();

        jest.clearAllMocks();
        mockAuthState = { ...mockAuthState, driver: null };
        await ReactTestRenderer.act(async () => {
            renderer.update(renderProvider());
        });

        expect(BackgroundGeolocation.stop).toHaveBeenCalled();
    });
    test('upload error survives a local fix and clears only after an acknowledged upload', async () => {
        let renderer;
        await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(renderProvider()); });
        await ReactTestRenderer.act(async () => { BackgroundGeolocation.onLocation.mock.calls[0][1]({ code: 'LOCATION_UPLOAD_UNAVAILABLE' }); });
        expect(latestLocationState.isTracking).toBe(true);
        expect(latestLocationState.trackingError).toBe('LOCATION_UPLOAD_UNAVAILABLE');
        await ReactTestRenderer.act(async () => { BackgroundGeolocation.onLocation.mock.calls[0][0]({ coords: { latitude: 1, longitude: 2 } }); });
        expect(latestLocationState.trackingError).toBe('LOCATION_UPLOAD_UNAVAILABLE');
        await ReactTestRenderer.act(async () => { BackgroundGeolocation.onUpload.mock.calls[0][0](); });
        expect(latestLocationState.trackingError).toBe(null);
        await ReactTestRenderer.act(async () => renderer.unmount());
    });

});
