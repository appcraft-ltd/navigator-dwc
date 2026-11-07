import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Text, YStack, XStack } from 'tamagui';
import useFleetbase from '../hooks/use-fleetbase';
import useFocusedRefresh from '../hooks/use-focused-refresh';
import { useAuth } from '../contexts/AuthContext';
import { runDistance } from '../utils/delivery-runs';

export default function DeliveryRunsScreen() {
    const { adapter } = useFleetbase();
    const { driver } = useAuth();
    const navigation = useNavigation<any>();
    const [view, setView] = useState('active');
    const [data, setData] = useState<any>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const scope = `${driver?.id}:${view}`;
    const currentScope = useRef(scope); currentScope.current = scope;
    const requestId = useRef(0);
    const visible = data?.scope === scope ? data : null;
    const fetchPage = useCallback(async (page = 1) => {
        if (!adapter) return;
        const ticket = ++requestId.current;
        setBusy(true); setError('');
        try {
            const next = await adapter.get(`navigator/runs?summary=1&view=${view}&page=${page}`);
            if (!Array.isArray(next.runs) || !Number.isInteger(next.page) || typeof next.has_more !== 'boolean') throw new Error('Run list unavailable.');
            if (currentScope.current !== scope || ticket !== requestId.current) return;
            setData(previous => ({ scope, page: next.page, hasMore: next.has_more,
                runs: page === 1 ? next.runs : [...(previous?.scope === scope ? previous.runs : []), ...next.runs.filter(run => !previous?.runs?.some(row => row.id === run.id))] }));
        } catch {
            if (currentScope.current === scope && ticket === requestId.current) setError('Cannot load delivery runs. Pull down to retry.');
        } finally { if (currentScope.current === scope && ticket === requestId.current) setBusy(false); }
    }, [adapter, scope, view]);
    useFocusedRefresh(useCallback(() => fetchPage(1), [fetchPage]), view === 'history' ? 0 : 30000);
    return <YStack flex={1} bg='$background' pt='$5'>
        <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={() => fetchPage(1)} />}>
            <YStack px='$4' py='$4' gap='$4'>
                <Text color='$textPrimary' fontSize='$8' fontWeight='700'>Runs</Text>
                <XStack gap='$2'>
                    <Button bg={view === 'active' ? '$primary' : '$surface'} accessibilityRole='tab' accessibilityState={{ selected: view === 'active' }} onPress={() => setView('active')}>New & active</Button>
                    <Button bg={view === 'history' ? '$primary' : '$surface'} accessibilityRole='tab' accessibilityState={{ selected: view === 'history' }} onPress={() => setView('history')}>Past runs</Button>
                </XStack>
                <Text color='$textSecondary'>{view === 'history' ? 'Your completed and cancelled runs, newest first.' : 'Preview new runs and accept once. Your accepted runs stay here until finished.'}</Text>
                {!!error && <Text color='$errorText' accessibilityLiveRegion='polite'>{error}</Text>}
                {!visible && !error && <Text color='$textSecondary'>Loading runs…</Text>}
                {visible && !visible.runs.length && <Text color='$textSecondary'>{view === 'history' ? 'No past runs yet.' : 'No delivery runs assigned yet.'}</Text>}
                {visible?.runs.map(run => <YStack key={run.id} p='$4' gap='$2' borderWidth={1} borderColor='$borderColor' borderRadius='$4'>
                    <Text color='$textPrimary' fontSize='$6' fontWeight='700'>{run.date} · {run.status === 'completed' ? 'Completed' : run.status === 'cancelled' ? 'Cancelled' : run.accepted ? 'Accepted' : 'New run'}</Text>
                    <Text color='$textPrimary'>{runDistance(run)} · {run.stop_count} stops · {run.order_count} orders</Text>
                    <Text color='$textSecondary' fontSize='$2'>{run.id}</Text>
                    <Button onPress={() => navigation.navigate('DeliveryRun', { runId: run.id })}>{view === 'history' ? 'View run' : 'Open delivery run'}</Button>
                </YStack>)}
                {visible?.hasMore && <Button disabled={busy} onPress={() => fetchPage(visible.page + 1)}>Load more runs</Button>}
                {view === 'active' && <Button onPress={() => navigation.navigate('StandaloneOrders')}>Standalone orders</Button>}
            </YStack>
        </ScrollView>
    </YStack>;
}
