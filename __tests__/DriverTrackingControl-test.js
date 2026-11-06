import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import DriverTrackingControl from '../src/components/DriverTrackingControl';
import { trackingStatus } from '../src/location/tracking-status';

let mockAuth;
let mockLocation;
jest.mock('../src/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../src/contexts/LocationContext', () => ({ useLocation: () => mockLocation }));
jest.mock('tamagui', () => {
    const React = require('react');
    const { View, Text } = require('react-native');
    const Switch = Object.assign((props) => React.createElement(View, props, props.children), { Thumb: View });
    return { Text, XStack: View, YStack: View, Switch };
});
const text = (screen) => screen.root.findAllByType(Text).map((n) => n.props.children).flat().join(' ');
beforeEach(() => {
    mockAuth = { isOnline: false, toggleOnline: jest.fn() };
    mockLocation = { isTracking: false, permissionStatus: 'granted', trackingError: null };
});
test('offline is explicit, one request starts online, then native status confirms tracking', async () => {
    let finish;
    mockAuth.toggleOnline.mockImplementation(() => new Promise((resolve) => { finish = () => { mockAuth.isOnline = true; resolve({ isOnline: true }); }; }));
    let screen;
    await act(async () => { screen = Renderer.create(<DriverTrackingControl />); });
    expect(text(screen)).toContain('Offline');
    const toggle = () => screen.root.findByProps({ accessibilityLabel: 'Online availability' });
    let first;
    await act(async () => { first = toggle().props.onCheckedChange(true); await toggle().props.onCheckedChange(true); });
    expect(mockAuth.toggleOnline).toHaveBeenCalledTimes(1);
    expect(toggle().props.disabled).toBe(true);
    expect(text(screen)).toContain('Updating');
    await act(async () => { finish(); await first; });
    expect(text(screen)).toContain('Online');
    expect(text(screen)).toContain('Starting');
    mockLocation.isTracking = true;
    await act(async () => screen.update(<DriverTrackingControl />));
    expect(text(screen)).toContain('Location sharing is active');
    await act(async () => screen.unmount());
});
test('failed online request preserves offline switch and reports error', async () => {
    mockAuth.toggleOnline.mockRejectedValue(new Error('Synthetic failure'));
    let screen;
    await act(async () => { screen = Renderer.create(<DriverTrackingControl />); });
    await act(async () => { await screen.root.findByProps({ accessibilityLabel: 'Online availability' }).props.onCheckedChange(true); });
    expect(text(screen)).toContain('Offline');
    expect(text(screen)).toContain('Could not update');
    expect(screen.root.findByProps({ accessibilityLabel: 'Online availability' }).props.checked).toBe(false);
    await act(async () => screen.unmount());
});
test('permission, upload, session and start failures remain distinct from a successful GPS start', () => {
    const on = { isOnline: true, isTracking: true, permissionStatus: 'granted' };
    expect(trackingStatus({ ...on, permissionStatus: 'denied' }).label).toBe('Permission needed');
    expect(trackingStatus({ ...on, trackingError: 'LOCATION_UPLOAD_UNAVAILABLE' }).detail).toContain('cannot reach dispatch');
    expect(trackingStatus({ ...on, trackingError: 'LOCATION_SESSION_EXPIRED' }).detail).toContain('Sign in again');
    expect(trackingStatus({ ...on, isTracking: false, trackingError: 'LOCATION_START' }).label).toBe('Error');
    expect(trackingStatus({ ...on, isOnline: false, trackingError: 'LOCATION_UPLOAD_UNAVAILABLE' }).label).toBe('Off');
});
