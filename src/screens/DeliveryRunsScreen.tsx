import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button, Text, YStack } from 'tamagui';
import useFleetbase from '../hooks/use-fleetbase';
import { useAuth } from '../contexts/AuthContext';
import { runDistance } from '../utils/delivery-runs';

export default function DeliveryRunsScreen() {
    const { adapter } = useFleetbase();
    const { driver } = useAuth();
    const navigation = useNavigation<any>();
    const [runs, setRuns] = useState<any[]>([]);
    const [busy, setBusy] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');
    const generation = useRef(0);
    const refresh = useCallback(async () => {
        const version = generation.current;
        if (!adapter) return;
        try { const next = await adapter.get('navigator/runs'); if (generation.current === version) { setRuns(next.runs); setLoaded(true); setError(''); } }
        catch { if (generation.current === version) setError('Cannot load delivery runs. Pull down to retry.'); }
    }, [adapter]);
    useFocusEffect(useCallback(() => {
        generation.current++; setRuns([]); setLoaded(false);
        refresh(); const timer = setInterval(refresh, 30000);
        return () => { generation.current++; clearInterval(timer); };
    }, [refresh, driver?.id]));
    return <YStack flex={1} bg='$background' pt='$5'>
        <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={async () => { setBusy(true); await refresh(); setBusy(false); }} />}>
            <YStack px='$4' py='$4' gap='$4'>
                <Text color='$textPrimary' fontSize='$8' fontWeight='700'>Delivery runs</Text>
                <Text color='$textSecondary'>Preview the whole route, accept once, then complete each order with pickup and drop-off photos.</Text>
                {!!error && <Text color='$errorText' accessibilityLiveRegion='polite'>{error}</Text>}
                {!loaded && !error && <Text color='$textSecondary'>Loading runs…</Text>}
                {loaded && !runs.length && <Text color='$textSecondary'>No delivery runs assigned yet.</Text>}
                {runs.map(run => <YStack key={run.id} p='$4' gap='$2' borderWidth={1} borderColor='$borderColor' borderRadius='$4'>
                    <Text color='$textPrimary' fontSize='$6' fontWeight='700'>{run.date} · {run.accepted ? 'Accepted' : 'New run'}</Text>
                    <Text color='$textPrimary'>{runDistance(run)} · {run.stop_count} stops · {run.orders.length} orders</Text>
                    <Text color='$textSecondary' fontSize='$2'>{run.id}</Text>
                    <Button onPress={() => navigation.navigate('DeliveryRun', { runId: run.id })}>Preview delivery run</Button>
                </YStack>)}
                <Button onPress={() => navigation.navigate('StandaloneOrders')}>Standalone orders</Button>
            </YStack>
        </ScrollView>
    </YStack>;
}
