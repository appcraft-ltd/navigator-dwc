import React, { useRef, useState } from 'react';
import { SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { Button, Input, Spinner, Text, YStack } from 'tamagui';
import { useAuth } from '../contexts/AuthContext';
import { useConfig } from '../contexts/ConfigContext';
import { createEmailLogin, normalizeEmail } from '../auth/email-login';

export default function EmailLoginScreen() {
    const { createDriverSession } = useAuth();
    const { resolveConnectionConfig } = useConfig();
    const [email, setEmail] = useState('');
    const [sentTo, setSentTo] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const inFlight = useRef(false);

    const submit = async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        setBusy(true);
        setError('');
        try {
            const api = createEmailLogin(resolveConnectionConfig('FLEETBASE_HOST'));
            if (sentTo) {
                const driver = await api.verify(sentTo, code);
                await createDriverSession(driver);
            } else {
                const identity = normalizeEmail(email);
                await api.send(identity);
                setSentTo(identity);
            }
        } catch (failure) {
            setError(failure.message || 'Sign-in is unavailable. Try again later.');
        } finally {
            inFlight.current = false;
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#111827' }}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <YStack flex={1} justifyContent='center' padding='$5' space='$4'>
                    <Text color='white' fontSize='$9' fontWeight='bold'>FullSend Driver</Text>
                    <Text color='$gray-300' fontSize='$5'>{sentTo ? `If this email belongs to an active driver, a code was sent to ${sentTo}.` : 'Sign in with your driver email.'}</Text>
                    {sentTo ? (
                        <Input accessibilityLabel='Verification code' value={code} onChangeText={setCode} keyboardType='number-pad' autoComplete='one-time-code' maxLength={6} placeholder='6-digit code' editable={!busy} color='white' bg='$gray-800' size='$5' onSubmitEditing={submit} />
                    ) : (
                        <Input accessibilityLabel='Email address' value={email} onChangeText={setEmail} keyboardType='email-address' autoCapitalize='none' autoCorrect={false} autoComplete='email' placeholder='Your email' editable={!busy} color='white' bg='$gray-800' size='$5' onSubmitEditing={submit} />
                    )}
                    {!!error && <Text accessibilityRole='alert' color='$red-300'>{error}</Text>}
                    <Button size='$5' bg='$primary' disabled={busy} onPress={submit}>
                        {busy ? <Spinner color='white' /> : <Button.Text color='white'>{sentTo ? 'Sign in' : 'Send code'}</Button.Text>}
                    </Button>
                    {!!sentTo && <Button disabled={busy} onPress={() => { setSentTo(''); setCode(''); setError(''); }}>Change email / request a new code</Button>}
                </YStack>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
