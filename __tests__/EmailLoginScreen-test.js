import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TextInput, Text } from 'react-native';
import { Button } from 'tamagui';
import EmailLoginScreen from '../src/screens/EmailLoginScreen';

const mockSession = jest.fn();
jest.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({ createDriverSession: mockSession }) }));
jest.mock('../src/contexts/ConfigContext', () => ({ useConfig: () => ({ resolveConnectionConfig: () => 'https://api.example.test' }) }));
jest.mock('tamagui', () => {
    const React = require('react');
    const { View, Text, TextInput, Pressable } = require('react-native');
    const Button = Object.assign((props) => React.createElement(Pressable, props, props.children), { Text });
    return { Button, Input: TextInput, Spinner: View, Text, YStack: View };
});

afterEach(() => { jest.restoreAllMocks(); mockSession.mockReset(); });

test('first install sends email then establishes the existing driver session without connection setup', async () => {
    global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ status: 'ok' }) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ driver: { id: 'driver_synthetic', token: 'synthetic-token' } }) });
    let screen;
    await act(async () => { screen = Renderer.create(<EmailLoginScreen />); });
    await act(async () => { screen.root.findByType(TextInput).props.onChangeText('driver@example.test'); });
    await act(async () => { await screen.root.findAllByType(Button)[0].props.onPress(); });
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.example.test/v1/navigator/auth/email');
    expect(screen.root.findByType(TextInput).props.accessibilityLabel).toBe('Verification code');
    await act(async () => { screen.root.findByType(TextInput).props.onChangeText('123456'); });
    await act(async () => { await screen.root.findAllByType(Button)[0].props.onPress(); });
    expect(mockSession).toHaveBeenCalledWith({ id: 'driver_synthetic', token: 'synthetic-token' });
    expect(screen.root.findAllByType(Text).some((node) => String(node.props.children).includes('Connection Config'))).toBe(false);
    await act(async () => screen.unmount());
});

test('a double tap sends one request and a refused code never creates a session', async () => {
    let finish;
    global.fetch = jest.fn().mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }))
        .mockResolvedValueOnce({ ok: false, status: 422 });
    let screen;
    await act(async () => { screen = Renderer.create(<EmailLoginScreen />); });
    await act(async () => { screen.root.findByType(TextInput).props.onChangeText('driver@example.test'); });
    let first;
    await act(async () => {
        const submit = screen.root.findAllByType(Button)[0].props.onPress;
        first = submit();
        await submit();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ ok: true, status: 202, json: async () => ({ status: 'ok' }) }); await first; });
    await act(async () => { screen.root.findByType(TextInput).props.onChangeText('123456'); });
    await act(async () => { await screen.root.findAllByType(Button)[0].props.onPress(); });
    expect(mockSession).not.toHaveBeenCalled();
    expect(screen.root.findByProps({ accessibilityRole: 'alert' }).props.children).toContain('invalid');
    await act(async () => screen.unmount());
});
