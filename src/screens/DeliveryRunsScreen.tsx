import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Text, YStack, XStack } from 'tamagui';
import useFleetbase from '../hooks/use-fleetbase';
import useFocusedRefresh from '../hooks/use-focused-refresh';
import { useAuth } from '../contexts/AuthContext';
import { orderReferences, runDistance } from '../utils/delivery-runs';
import { dubaiDay, formatDay, formatDubaiCreated } from '../utils/dubai-dates';

const pastStatuses = ['completed', 'canceled'];

function groupAssignments(orders: any[], runs: any[], today: string | null, history: boolean) {
    const groups = new Map<string | null, { day: string | null; orders: any[]; runs: any[] }>();
    function group(day: string | null) {
        const existing = groups.get(day);
        if (existing) return existing;
        const next = { day, orders: [] as any[], runs: [] as any[] };
        groups.set(day, next);
        return next;
    }

    for (const order of orders) {
        const day = dubaiDay(order.meta?.delivery_date) ?? dubaiDay(order.scheduled_at) ?? dubaiDay(order.created_at);
        group(day).orders.push(order);
    }
    for (const run of runs) group(dubaiDay(run.date)).runs.push(run);

    return [...groups.values()].sort((a, b) => {
        if (a.day === b.day) return 0;
        if (!a.day) return 1;
        if (!b.day) return -1;
        if (!history && today) {
            if (a.day === today) return -1;
            if (b.day === today) return 1;
            if (a.day > today && b.day > today) return a.day.localeCompare(b.day);
        }
        return b.day.localeCompare(a.day);
    });
}

const orderStatus = (status: string) => status === 'enroute' ? 'In progress' : status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ');
const placeLabel = (place: any) => place?.name || place?.street1 || place?.address || 'Address unavailable';

export default function DeliveryRunsScreen() {
    const { adapter } = useFleetbase();
    const { driver } = useAuth();
    const navigation = useNavigation<any>();
    const [view, setView] = useState('active');
    const [data, setData] = useState<any>();
    const [ordersData, setOrdersData] = useState<any>();
    const [busy, setBusy] = useState(false);
    const [ordersBusy, setOrdersBusy] = useState(false);
    const [error, setError] = useState<any>();
    const [ordersError, setOrdersError] = useState<any>();
    const driverId = driver?.id;
    const scope = `${driverId}:${view}`;
    const currentScope = useRef({ scope, adapter }); currentScope.current = { scope, adapter };
    const requestId = useRef(0);
    const ordersRequestId = useRef(0);
    const isCurrent = useCallback(() => currentScope.current.scope === scope && currentScope.current.adapter === adapter, [scope, adapter]);
    const visible = data?.scope === scope && data.adapter === adapter ? data : null;
    const visibleOrders = ordersData?.scope === scope && ordersData.adapter === adapter ? ordersData.orders : null;
    const runError = error?.scope === scope && error.adapter === adapter ? error.message : '';
    const orderError = ordersError?.scope === scope && ordersError.adapter === adapter ? ordersError.message : '';
    useEffect(() => () => { ++requestId.current; ++ordersRequestId.current; }, []);

    const fetchPage = useCallback(async (page = 1) => {
        if (!adapter || !driverId) return;
        const ticket = ++requestId.current;
        setBusy(true); setError(null);
        try {
            const next = await adapter.get(`navigator/runs?summary=1&view=${view}&page=${page}`);
            if (!Array.isArray(next.runs) || !Number.isInteger(next.page) || typeof next.has_more !== 'boolean') throw new Error('Run list unavailable.');
            if (!isCurrent() || ticket !== requestId.current) return;
            setData(previous => ({ scope, adapter, page: next.page, hasMore: next.has_more,
                runs: page === 1 ? next.runs : [...(previous?.scope === scope && previous.adapter === adapter ? previous.runs : []), ...next.runs.filter(run => !previous?.runs?.some(row => row.id === run.id))] }));
        } catch {
            if (isCurrent() && ticket === requestId.current) setError({ scope, adapter, message: 'Cannot load delivery runs. Pull down to retry.' });
        } finally { if (isCurrent() && ticket === requestId.current) setBusy(false); }
    }, [adapter, driverId, scope, view, isCurrent]);

    const fetchOrders = useCallback(async () => {
        if (!adapter || !driverId) return;
        const ticket = ++ordersRequestId.current;
        setOrdersBusy(true); setOrdersError(null);
        try {
            const statusFilter = view === 'active'
                ? { active: true }
                : { dispatched: true, status: pastStatuses.join(',') };
            const next = await adapter.get('orders', { driver_assigned: driverId, ...statusFilter, limit: -1, sort: '-created_at' });
            if (!Array.isArray(next) || next.some(order => !order || typeof order.id !== 'string' || typeof order.status !== 'string')) throw new Error('Order list unavailable.');
            if (!isCurrent() || ticket !== ordersRequestId.current) return;
            const orders = next.filter(order => !order.meta?.navigator_run_id
                && (view === 'active' || pastStatuses.includes(order.status)));
            setOrdersData({ scope, adapter, orders: [...new Map(orders.map(order => [order.id, order])).values()] });
        } catch {
            if (isCurrent() && ticket === ordersRequestId.current) setOrdersError({ scope, adapter, message: 'Cannot refresh assigned orders. Pull down to retry.' });
        } finally { if (isCurrent() && ticket === ordersRequestId.current) setOrdersBusy(false); }
    }, [adapter, driverId, scope, view, isCurrent]);
    const refresh = useCallback(() => Promise.all([fetchPage(1), fetchOrders()]), [fetchPage, fetchOrders]);
    useFocusedRefresh(refresh, view === 'history' ? 0 : 30000);

    const history = view === 'history';
    const today = dubaiDay(new Date());
    const groups = groupAssignments(visibleOrders ?? [], visible?.runs ?? [], today, history);
    const loaded = visible && visibleOrders && !runError && !orderError;

    return <YStack flex={1} bg='$background' pt='$5'>
        <ScrollView refreshControl={<RefreshControl refreshing={busy || ordersBusy} onRefresh={refresh} />}>
            <YStack px='$4' py='$4' gap='$4'>
                <Text color='$textPrimary' fontSize='$8' fontWeight='700'>Assignments</Text>
                <XStack gap='$2'>
                    <Button flex={1} bg={!history ? '$primary' : '$surface'} color={!history ? '$white' : '$textPrimary'} accessibilityRole='tab' accessibilityState={{ selected: !history }} onPress={() => setView('active')}>Active trips</Button>
                    <Button flex={1} bg={history ? '$primary' : '$surface'} color={history ? '$white' : '$textPrimary'} accessibilityRole='tab' accessibilityState={{ selected: history }} onPress={() => setView('history')}>Past trips</Button>
                </XStack>
                {!!orderError && <Text color='$errorText' accessibilityLiveRegion='polite'>{orderError}</Text>}
                {!!runError && <Text color='$errorText' accessibilityLiveRegion='polite'>{runError}</Text>}
                {!visibleOrders && !orderError && <Text color='$textSecondary'>Loading orders…</Text>}
                {!visible && !runError && <Text color='$textSecondary'>Loading runs…</Text>}
                {loaded && !groups.length && <Text color='$textSecondary'>{history ? 'No past trips yet.' : 'No active assignments yet.'}</Text>}
                {!!groups.length && <Text color='$textSecondary' fontSize='$3'>Dates in Dubai time</Text>}
                {groups.map(({ day, orders, runs }) => <YStack key={day ?? 'undated'} gap='$3'>
                    <XStack justifyContent='space-between' alignItems='center' gap='$2'>
                        <Text color='$textPrimary' fontSize='$5' fontWeight='700' accessibilityRole='header'>
                            {day ? `${day === today ? 'Today · ' : ''}${formatDay(day)}` : 'Date unavailable'}
                        </Text>
                        <Text color='$textSecondary' fontSize='$3'>
                            {`${orders.length + runs.length} ${orders.length + runs.length === 1 ? 'assignment' : 'assignments'}`}
                        </Text>
                    </XStack>
                    {runs.map(run => <YStack key={run.id} p='$4' gap='$2' borderWidth={1} borderColor='$borderColor' borderRadius='$4'>
                        <Text color='$textPrimary' fontSize='$6' fontWeight='700'>Delivery run</Text>
                        <Text color='$textSecondary'>{run.status === 'completed' ? 'Completed' : run.status === 'cancelled' ? 'Cancelled' : run.accepted ? 'Accepted' : 'New run'}</Text>
                        <Text color='$textPrimary'>{runDistance(run)} · {run.stop_count} stops · {run.order_count} orders</Text>
                        <Text color='$textSecondary' fontSize='$2'>{run.id}</Text>
                        <Button bg='$primary' color='$white' accessibilityRole='button' onPress={() => navigation.navigate('DeliveryRun', { runId: run.id })}>{history ? 'View run' : 'Open delivery run'}</Button>
                    </YStack>)}
                    {orders.map(order => {
                        const refs = orderReferences(order);
                        const created = formatDubaiCreated(order.created_at);
                        return <YStack key={order.id} p='$4' gap='$2' borderWidth={1} borderColor='$borderColor' borderRadius='$4'>
                            <Text color='$textPrimary' fontSize='$6' fontWeight='700'>{refs.primary}</Text>
                            {!!refs.secondary && <Text color='$textSecondary'>{refs.secondary}</Text>}
                            <Text color='$textSecondary'>{orderStatus(order.status)}</Text>
                            {!!created && <Text color='$textSecondary' fontSize='$3'>Created {created}</Text>}
                            <Text color='$textPrimary'>Pickup: {placeLabel(order.payload?.pickup)}</Text>
                            <Text color='$textPrimary'>Drop-off: {placeLabel(order.payload?.dropoff)}</Text>
                            <Button bg='$primary' color='$white' accessibilityRole='button' onPress={() => navigation.navigate('Order', { order })}>{history ? 'View order' : 'Open order'}</Button>
                        </YStack>;
                    })}
                </YStack>)}
                {visible?.hasMore && <Button disabled={busy} onPress={() => fetchPage(visible.page + 1)}>Load more runs</Button>}
            </YStack>
        </ScrollView>
    </YStack>;
}
