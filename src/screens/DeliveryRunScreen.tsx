import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Text, YStack, XStack } from 'tamagui';
import { WebView } from 'react-native-webview';
import { v4 as uuid } from 'uuid';
import useFocusedRefresh from '../hooks/use-focused-refresh';
import useFleetbase from '../hooks/use-fleetbase';
import { storage } from '../hooks/use-storage';
import { useAuth } from '../contexts/AuthContext';
import { openOsmAnd, pickupTime, runPickupPosition } from '../utils/run-pickup';
import { runAcceptKey, runDistance, currentRunOrder, orderReferences, runMapHtml } from '../utils/delivery-runs';

export default function DeliveryRunScreen({ route, current = false }: any) {
    const { adapter } = useFleetbase();
    const { driver } = useAuth();
    const navigation = useNavigation<any>();
    const [run, setRun] = useState<any>();
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const lock = useRef(false);
    const id = route?.params?.runId;
    const owner = `${driver?.id}:${current ? 'current' : id}`;
    const currentOwner = useRef(owner); currentOwner.current = owner;
    useEffect(() => { setRun(undefined); setLoaded(false); setError(''); currentOwner.current = owner; return () => { currentOwner.current = ''; }; }, [owner]);
    const base = current ? 'navigator/runs?view=current' : `navigator/runs/${id}`;
    const apply = useCallback((next) => {
        if (currentOwner.current !== owner) return;
        setRun(next); setLoaded(true); setError('');
        if (next?.accepted) storage.removeItem(runAcceptKey(driver.id, id));
    }, [owner, driver?.id, id]);
    const refresh = useCallback(async () => {
        const result = await adapter.get(base);
        if (current && !Object.prototype.hasOwnProperty.call(result, 'run')) throw new Error('Current run unavailable.');
        const next = current ? result.run : result;
        apply(next); return next;
    }, [adapter, base, current, apply]);
    useFocusedRefresh(useCallback(async () => {
        if (!adapter) return;
        try { await refresh(); }
        catch { setError('Cannot refresh this run. Pull down to retry.'); }
    }, [refresh, adapter]));
    const accept = async () => {
        if (lock.current || !driver?.id) return;
        lock.current = true; setBusy(true); setError('');
        try {
            const latest = await refresh();
            if (!latest || latest.accepted || currentOwner.current !== owner) return;
            const key = runAcceptKey(driver.id, id);
            let operationId = storage.getString(key);
            if (!operationId) { operationId = uuid(); storage.setString(key, operationId); }
            const location = latest.orders.some(order => order.meta?.cargodept_source === 'cargodept-v1')
                ? await runPickupPosition() : undefined;
            if (currentOwner.current !== owner) return;
            apply(await adapter.post(`${base}/accept`, { operation_id: operationId, ...(location ? { location } : {}) }));
        } catch (err) {
            let recovered; try { recovered = await refresh(); } catch {}
            if (!recovered?.accepted && currentOwner.current === owner) setError(err.message || 'Unable to accept. Retry safely when connected.');
        } finally { lock.current = false; if (currentOwner.current === owner) setBusy(false); }
    };
    const pickup = run?.pickup_appointment;
    const planned = pickup?.state === 'scheduled' && pickupTime(pickup.plannedAt);
    const navigateToWarehouse = async () => {
        try { await openOsmAnd(pickup.warehouse); }
        catch { if (currentOwner.current === owner) setError('Install OsmAnd to open directions to the warehouse.'); }
    };
    const next = run && currentRunOrder(run);
    const active = run?.accepted && !['completed', 'cancelled'].includes(run.status);
    const [showRoute, setShowRoute] = useState(false);
    useEffect(() => { setShowRoute(false); }, [owner, run?.id]);
    const map = () => <YStack height={270} borderRadius='$3' overflow='hidden'>
        <WebView source={{ html: runMapHtml(run.stops), baseUrl: 'https://run-preview.local/' }} originWhitelist={['https://run-preview.local']} mixedContentMode='never' javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={false} onShouldStartLoadWithRequest={r => r.url === 'about:blank' || r.url.startsWith('https://run-preview.local/')} />
    </YStack>;
    return <YStack flex={1} bg='$background'>
        <XStack px='$4' pt='$4' pb='$3' alignItems='center' gap='$3'>{!current && <Button onPress={() => navigation.goBack()}>Back</Button>}<Text color='$textPrimary' fontSize='$6' fontWeight='700'>{current ? 'Current Run' : 'Delivery run'}</Text></XStack>
        <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={() => refresh().then(() => setError('')).catch(() => setError('Cannot refresh this run.'))} />}>
            <YStack px='$4' pb='$5' gap='$3'>
                {!!error && <Text color='$errorText' accessibilityLiveRegion='polite'>{error}</Text>}
                {!loaded && <Text color='$textSecondary'>Loading delivery run…</Text>}
                {current && loaded && !run && <YStack gap='$3'><Text color='$textPrimary'>No current run</Text><Text color='$textSecondary'>Accept a new delivery run in Runs to see your current tasks here.</Text><Button onPress={() => navigation.navigate('DriverTaskTab', { screen: 'DriverOrderManagement' })}>Open Runs</Button></YStack>}
                {run && <>
                    <Text color='$textSecondary'>{run.date} · {run.orders.length} orders</Text>
                    <Text color='$textPrimary' fontSize='$6' fontWeight='700'>{run.status === 'cancelled' ? 'Cancelled' : run.status === 'completed' ? 'Completed' : run.accepted ? 'Run accepted' : 'Awaiting your acceptance'}</Text>
                    {pickup && !['completed', 'cancelled'].includes(run.status) && <YStack gap='$2' p='$3' borderWidth={1} borderColor='$primaryBorder' borderRadius='$3'>
                        <Text color='$textPrimary'>{planned ? 'Warehouse pickup · ' + planned + ' Dubai'
                            : pickup.state === 'pending' ? 'Scheduling warehouse pickup…' : 'Dispatcher to review warehouse pickup'}</Text>
                        {pickup.warehouse && <Button onPress={navigateToWarehouse}>Open warehouse in OsmAnd</Button>}
                    </YStack>}
                    {!active && <>
                        <Text color='$textSecondary'>{runDistance(run)} · {run.stop_count} stops</Text>
                        {map()}
                        <Text color='$textSecondary' fontSize='$2'>Estimated driving distance from the first pickup. The map line shows stop order.</Text>
                    </>}
                    {run.route_changed && <Text color='$textSecondary'>Some stop addresses have changed since dispatch. This preview shows the currently saved addresses.</Text>}
                    {!run.accepted && run.status === 'active' && <Button minHeight={56} disabled={busy} bg='$success' borderColor='$successBorder' borderWidth={1} onPress={accept}><Button.Text fontSize={18} fontWeight='700' color='$successText'>{busy ? 'Accepting…' : 'Accept delivery run'}</Button.Text></Button>}
                    {run.orders.map((order, i) => {
                        const refs = orderReferences(order);
                        const stops = run.stops.filter(s => s.order_id === order.id);
                        const remaining = stops.find(s => s.status !== 'completed');
                        const recipient = [...stops].reverse().find(s => s.type === 'dropoff')?.name;
                        const ready = active && next?.id === order.id;
                        const terminal = ['completed', 'canceled'].includes(order.status);
                        const action = remaining?.type === 'pickup' ? 'Pick Up' : remaining?.type === 'dropoff' ? 'Drop Off' : 'Continue order';
                        return <YStack key={order.id} p='$4' gap='$2' bg='$surface' borderWidth={1} borderColor='$borderColor' borderRadius='$4'>
                            <Text color='$textSecondary' fontSize={13} fontWeight='700'>
                                {String(i + 1).padStart(2, '0')} · {order.meta?.operation === 'collection' ? 'COLLECTION' : 'DELIVERY'}
                                {terminal ? (order.status === 'completed' ? ' · COMPLETED' : ' · CANCELLED') : active && !ready ? ' · UPCOMING' : ''}
                            </Text>
                            <Text color='$textPrimary' fontSize={22} lineHeight={27} fontWeight='700'>{refs.customers || refs.primary}{recipient && !refs.wholeTrip ? ' / ' + recipient : ''}</Text>
                            {!!refs.packingLists && <Text color='$textPrimary' fontSize={20} lineHeight={25} fontWeight='700'>{refs.packingLists}</Text>}
                            {!!refs.secondary && <Text color='$textSecondary' fontSize={13}>{refs.secondary}</Text>}
                            {!active && stops.map(stop => <Text key={stop.sequence} color='$textSecondary'>{stop.sequence}. {stop.type === 'pickup' ? 'Pickup' : 'Drop off'} · {stop.name || stop.address}{stop.name && stop.address ? ` · ${stop.address}` : ''}{stop.status === 'completed' ? ' ✓' : ''}</Text>)}
                            {ready ? <Button minHeight={56} mt='$2' bg='$blue-600' accessibilityLabel={action + ' · ' + refs.primary} onPress={() => navigation.navigate('Order', { order })}>
                                <Button.Text color='white' fontSize={20} fontWeight='700'>{action}</Button.Text>
                            </Button> : <Button minHeight={48} mt='$1' accessibilityLabel={'View order · ' + refs.primary} onPress={() => navigation.navigate('Order', { order })}>View order</Button>}
                        </YStack>;
                    })}
                    {active && <Button minHeight={48} accessibilityState={{ expanded: showRoute }} onPress={() => setShowRoute(value => !value)}>{showRoute ? 'Hide route map' : 'Show route map'}</Button>}
                    {active && showRoute && map()}
                </>}
            </YStack>
        </ScrollView>
    </YStack>;
}

export function CurrentRunScreen() { return <DeliveryRunScreen current />; }
