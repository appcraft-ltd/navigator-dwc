import { useRef, useState } from 'react';
import { Switch, Text, XStack, YStack } from 'tamagui';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { trackingStatus } from '../location/tracking-status';

export default function DriverTrackingControl() {
    const { isOnline, toggleOnline } = useAuth();
    const { isTracking, trackingError, permissionStatus } = useLocation();
    const [pending, setPending] = useState(false);
    const [toggleError, setToggleError] = useState(false);
    const inFlight = useRef(false);
    const status = trackingStatus({ isOnline, isTracking, trackingError, permissionStatus, pending, toggleError });

    const changeTracking = async (enabled) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setPending(true);
        setToggleError(false);
        try {
            await toggleOnline(enabled);
        } catch {
            setToggleError(true);
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    };

    return (
        <YStack gap='$3'>
            <XStack alignItems='center' justifyContent='space-between' gap='$4'>
                <YStack flex={1} gap='$1'>
                    <Text color='$textSecondary' fontSize={13}>Your status</Text>
                    <Text color='$textPrimary' fontSize={24} fontWeight='bold'>{isOnline ? 'Online' : 'Offline'}</Text>
                </YStack>
                <Switch accessibilityLabel='Online availability' accessibilityRole='switch'
                    checked={Boolean(isOnline)} disabled={pending} onCheckedChange={changeTracking}
                    bg={isOnline ? '$green-600' : '$gray-500'} opacity={pending ? 0.6 : 1}>
                    <Switch.Thumb animation='quick' bg='$white' />
                </Switch>
            </XStack>
            <XStack alignItems='center' gap='$2' accessibilityLiveRegion='polite'>
                <YStack width={9} height={9} borderRadius={5} bg={status.color} />
                <Text color={status.color} fontWeight='bold'>Tracking: {status.label}</Text>
            </XStack>
            <Text color='$textSecondary' fontSize={13}>{status.detail}</Text>
            <Text color='$textSecondary' fontSize={12}>Online: available for orders and sharing your location. Offline: unavailable for orders, location sharing off.</Text>
        </YStack>
    );
}
