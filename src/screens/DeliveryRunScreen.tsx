import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button, Text, YStack, XStack } from 'tamagui';
import { WebView } from 'react-native-webview';
import { v4 as uuid } from 'uuid';
import useFleetbase from '../hooks/use-fleetbase';
import { storage } from '../hooks/use-storage';
import { useAuth } from '../contexts/AuthContext';
import { runAcceptKey, runDistance, currentRunOrder, orderReference, runMapHtml } from '../utils/delivery-runs';

export default function DeliveryRunScreen({ route }) {
    const { adapter } = useFleetbase();
    const { driver } = useAuth();
    const navigation = useNavigation<any>();
    const [run, setRun] = useState<any>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const lock = useRef(false);
    const id = route.params.runId;
    const owner = `${driver?.id}:${id}`;
    const currentOwner = useRef(owner); currentOwner.current = owner;
    useEffect(() => { setRun(undefined); setError(''); currentOwner.current = owner; return () => { currentOwner.current = ''; }; }, [owner]);
    const base = `navigator/runs/${id}`;
    const apply = useCallback((next) => {
        if (currentOwner.current !== owner) return;
        setRun(next); setError('');
        if (next.accepted) storage.removeItem(runAcceptKey(driver.id, id));
    }, [owner, driver?.id, id]);
    const refresh = useCallback(async () => { const next = await adapter.get(base); apply(next); return next; }, [adapter, base, apply]);
    useFocusEffect(useCallback(() => {
        if (!adapter) return;
        let active = true;
        const load = () => refresh().catch(() => { if (active) setError('Cannot refresh this run. Pull down to retry.'); });
        load(); const timer = setInterval(load, 30000);
        return () => { active = false; clearInterval(timer); };
    }, [refresh, adapter]));
    const accept = async () => {
        if (lock.current || !driver?.id) return;
        lock.current = true; setBusy(true); setError('');
        try {
            const latest = await refresh();
            if (latest.accepted) return;
            const key = runAcceptKey(driver.id, id);
            let operationId = storage.getString(key);
            if (!operationId) { operationId = uuid(); storage.setString(key, operationId); }
            apply(await adapter.post(`${base}/accept`, { operation_id: operationId }));
        } catch (err) {
            let recovered; try { recovered = await refresh(); } catch {}
            if (!recovered?.accepted && currentOwner.current === owner) setError(err.message || 'Unable to accept. Retry safely when connected.');
        } finally { lock.current = false; if (currentOwner.current === owner) setBusy(false); }
    };
    const next = run && currentRunOrder(run);
    return <YStack flex={1} bg='$background'>
        <XStack px='$4' pt='$4' pb='$3' alignItems='center' gap='$3'><Button onPress={() => navigation.goBack()}>Back</Button><Text color='$textPrimary' fontSize='$6' fontWeight='700'>Delivery run</Text></XStack>
        <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={() => refresh().then(() => setError('')).catch(() => setError('Cannot refresh this run.'))} />}>
            <YStack px='$4' pb='$5' gap='$3'>
                {!!error && <Text color='$errorText' accessibilityLiveRegion='polite'>{error}</Text>}
                {!run && <Text color='$textSecondary'>Loading delivery run…</Text>}
                {run && <>
                    <Text color='$textSecondary'>{run.date} · {run.id}</Text>
                    <Text color='$textPrimary' fontSize='$7' fontWeight='700'>{runDistance(run)} · {run.stop_count} stops</Text>
                    <Text color='$textSecondary'>{run.orders.length} orders · {run.accepted ? (run.status === 'completed' ? 'Completed' : 'Accepted') : 'Awaiting your acceptance'}</Text>
                    <YStack height={270} borderRadius='$3' overflow='hidden'>
                        <WebView source={{ html: runMapHtml(run.stops), baseUrl: 'https://run-preview.local/' }} originWhitelist={['https://run-preview.local']} mixedContentMode='never' javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={false} onShouldStartLoadWithRequest={r => r.url === 'about:blank' || r.url.startsWith('https://run-preview.local/')} />
                    </YStack>
                    <Text color='$textSecondary' fontSize='$2'>Estimated driving distance from the first pickup. The map line shows stop order; use navigation for road directions.</Text>
                    {!run.accepted && run.status === 'active' && <Button disabled={busy} bg='$success' borderColor='$successBorder' borderWidth={1} onPress={accept}><Button.Text color='$successText'>{busy ? 'Accepting…' : 'Accept delivery run'}</Button.Text></Button>}
                    <Text color='$textPrimary' fontSize='$5' fontWeight='700'>Orders · dispatcher sequence</Text>
                    {run.orders.map((order, i) => <YStack key={order.id} p='$3' gap='$2' borderWidth={1} borderColor='$borderColor' borderRadius='$3'>
                        <XStack justifyContent='space-between'><Text color='$textPrimary' fontWeight='700'>{i + 1}. {orderReference(order)}</Text><Text color='$textSecondary'>{order.status}</Text></XStack>
                        {order.meta?.cargodept_packing_lists?.map(list => <Text key={`${list.number}:${list.customer_code}`} color='$textSecondary'>{list.customer_code} · PL {list.number}</Text>)}
                        {run.stops.filter(s => s.order_id === order.id).map(stop => <Text key={stop.sequence} color='$textSecondary'>{stop.sequence}. {stop.type === 'pickup' ? 'Pickup' : 'Drop off'} · {stop.name || stop.address}{stop.name && stop.address ? ` · ${stop.address}` : ''}{stop.status === 'completed' ? ' ✓' : ''}</Text>)}
                        <Button onPress={() => navigation.navigate('Order', { order })}>{!run.accepted ? 'View order' : next?.id === order.id ? 'Continue order · photo + GPS' : ['completed', 'canceled'].includes(order.status) ? 'View order' : 'Preview order'}</Button>
                    </YStack>)}
                </>}
            </YStack>
        </ScrollView>
    </YStack>;
}
