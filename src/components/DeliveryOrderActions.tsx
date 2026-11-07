import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Image, Text, YStack, XStack } from 'tamagui';
import { Order } from '@fleetbase/sdk';
import { v4 as uuid } from 'uuid';
import useFleetbase from '../hooks/use-fleetbase';
import useStorage, { storage } from '../hooks/use-storage';
import { useAuth } from '../contexts/AuthContext';
import CameraCapture from './CameraCapture';
import { pendingKey, prepareDeliveryPhoto, discardDeliveryPhoto, confirmationForm, sendMultipart } from '../utils/delivery-confirmations';

export default function DeliveryOrderActions({ order, onOrder, onManaged }) {
    const { adapter } = useFleetbase();
    const { driver } = useAuth();
    const key = pendingKey(driver?.id || 'none', order.id);
    const [pending, setPending] = useStorage<any>(key);
    const [state, setState] = useState<any>();
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [camera, setCamera] = useState(false);
    const lock = useRef(false);
    const currentKey = useRef(key);
    currentKey.current = key;
    const callbacks = useRef({ onOrder, onManaged });
    callbacks.current = { onOrder, onManaged };
    useEffect(() => { currentKey.current = key; return () => { currentKey.current = ''; }; }, [key]);
    const base = `navigator/orders/${order.id}/delivery`;
    const orderRevision = `${order.getAttribute?.('updated_at') || order.updated_at || ''}:${order.getAttribute?.('status') || order.status || ''}`;

    const apply = useCallback(async (next) => {
        if (currentKey.current !== key) return;
        setState(next);
        callbacks.current.onManaged(next.enabled);
        callbacks.current.onOrder(new Order(next.order, adapter));
        const saved = storage.getMap(key) as any;
        if (saved && (next.receipts?.[saved.stepKey || saved.stage] || next.terminal)) await discardDeliveryPhoto(key);
    }, [key, adapter]);

    const refresh = useCallback(async () => {
        const next = await adapter.get(base);
        await apply(next);
        return next;
    }, [adapter, base, apply]);
    useFocusEffect(useCallback(() => { refresh().catch(() => setError('Cannot check delivery steps. Refresh before continuing.')); }, [refresh, orderRevision]));
    useEffect(() => { setState(undefined); setError(''); }, [key]);

    const capture = async (photos) => {
        if (!photos.length || lock.current) return;
        lock.current = true;
        setCamera(false); setBusy('Preparing photo and getting GPS…'); setError('');
        try { await prepareDeliveryPhoto(photos[0], state.next, key, state.step_key); }
        catch (err) { setError(err.message || 'Unable to prepare photo. Check camera and location permissions.'); }
        finally { lock.current = false; setBusy(''); }
    };

    const confirm = async () => {
        if (lock.current) return;
        lock.current = true; setBusy('Checking order…'); setError('');
        try {
            // Read back first after every lost response. Never change a pending
            // operation's photo or GPS, and never advance optimistically.
            const next = await refresh();
            const saved = storage.getMap(key) as any;
            if (next.terminal || next.run?.blocked_reason || (pending && !saved)) return;
            if (next.next === 'accept') {
                const acceptKey = `${key}:accept`;
                let operationId = storage.getString(acceptKey);
                if (!operationId) { operationId = uuid(); storage.setString(acceptKey, operationId); }
                const result = await adapter.post(`${base}/accept`, { operation_id: operationId });
                await apply(result); storage.removeItem(acceptKey);
            } else {
                if (!saved || saved.stage !== next.next || (saved.stepKey || saved.stage) !== next.step_key) throw new Error('Take a photo for the current stop.');
                storage.setMap(key, { ...saved, attempted: true });
                setBusy('Uploading photo…');
                const result = await sendMultipart(adapter, `${base}/${saved.stage}`, confirmationForm(saved), (percent) => {
                    if (currentKey.current === key) setBusy(percent === 100 ? 'Saving photo and GPS…' : percent === null ? 'Uploading photo…' : `Uploading photo: ${percent}%`);
                });
                await apply(result);
            }
        } catch (err) {
            // A complete response may have been lost after COMMIT.
            let recovered;
            try { recovered = await refresh(); } catch {}
            const retained = storage.getMap(key) as any;
            if (retained && err.status === 422) storage.setMap(key, { ...retained, attempted: false });
            if (currentKey.current === key && !(recovered && pending && !retained)) setError(err.message || 'Unable to confirm. Your prepared photo is saved for retry.');
        } finally { lock.current = false; if (currentKey.current === key) setBusy(''); }
    };

    if (state?.enabled === false) return null;
    const title = state?.next === 'accept' ? 'Accept order' : state?.next === 'pickup' ? 'Confirm pickup' : 'Confirm drop off';
    return <YStack gap='$3' width='100%' py='$2'>
        <Text color='$textPrimary' fontSize='$5' fontWeight='700'>Delivery confirmation</Text>
        <Text color='$textSecondary'>{state?.run ? 'Pickup photo + GPS → Drop off photo + GPS' : '1. Accept → 2. Pickup photo + GPS → 3. Drop off photo + GPS'}</Text>
        {!!state?.run?.blocked_reason && <Text color='$textSecondary'>{state.run.blocked_reason}</Text>}
        {state?.stop && <Text color='$textPrimary'>Stop {state.stop.sequence}: {state.stop.name || state.stop.address || state.stop.id}</Text>}
        {!state && <Button disabled={!!busy} onPress={() => refresh().catch(() => setError('Unable to check order. Please retry.'))}>Refresh delivery steps</Button>}
        {state?.terminal && <Text color='$textSecondary'>{state.order.status === 'completed' ? 'Delivery completed' : 'Order canceled'}</Text>}
        {Object.entries(state?.proofs || {}).map(([stage, proof]: any) => <YStack key={stage} gap='$2'>
            <Text color='$textPrimary'>{proof.data.stage === 'pickup' ? 'Pickup confirmed' : 'Drop off confirmed'}{proof.data.stop?.sequence ? ` · Stop ${proof.data.stop.sequence}` : ''} · GPS saved</Text>
            <Image source={{ uri: proof.url }} width={120} height={90} borderRadius='$3' />
            <Text color='$textSecondary' fontSize='$2'>{new Date(proof.data.captured_at).toLocaleString()} · Accuracy ±{Math.round(proof.data.accuracy)} m</Text>
        </YStack>)}
        {pending && !state?.terminal && <YStack gap='$2'>
            <Image source={{ uri: `file://${pending.path}` }} width='100%' height={180} borderRadius='$3' resizeMode='contain' />
            <Text color='$textSecondary'>Photo ready · {Math.round(pending.bytes / 1024)} KB · GPS ±{Math.round(pending.accuracy)} m</Text>
            {!pending.attempted && <Button disabled={!!busy} onPress={() => discardDeliveryPhoto(key)}>Retake photo</Button>}
        </YStack>}
        {state?.next && !busy && <Button bg='$success' borderWidth={1} borderColor='$successBorder' onPress={state.next === 'accept' || pending ? confirm : () => setCamera(true)}>
            <Button.Text color='$successText'>{pending ? `Send ${pending.stage === 'pickup' ? 'pickup' : 'drop off'} confirmation` : title}</Button.Text>
        </Button>}
        {state?.next && state.next !== 'accept' && !pending && <Text color='$textSecondary'>Take a photo at this stop. Your current GPS position will be saved with it.</Text>}
        {!!busy && <Text accessibilityLiveRegion='polite' color='$textPrimary'>{busy}</Text>}
        {!!error && <Text accessibilityLiveRegion='polite' color='$errorText'>{error}</Text>}
        <Modal visible={camera} onRequestClose={() => setCamera(false)} animationType='slide'>
            <YStack flex={1} bg='$background' pt='$5'>
                <XStack px='$4' py='$3' alignItems='center' justifyContent='space-between'><Text color='$textPrimary'>{title} · Photo</Text><Button onPress={() => setCamera(false)}>Cancel</Button></XStack>
                <CameraCapture onDone={capture} maxPhotos={1} allowGallery={false} />
            </YStack>
        </Modal>
    </YStack>;
}
