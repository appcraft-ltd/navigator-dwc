import React, { useState } from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';
import { useLocation } from '../contexts/LocationContext';
import { useOrderManager } from '../contexts/OrderManagerContext';
import DriverTrackingControl from './DriverTrackingControl';

/** Existing tracking/auth controls and location context; no extra GPS subscription. */
export default function DriverOperationalStatus() {
    const { location } = useLocation();
    const { allActiveOrders } = useOrderManager();
    const [expanded, setExpanded] = useState(false);
    const coords = location?.coords;
    return <YStack mx='$3' p='$4' gap='$3' borderWidth={1} borderColor='$borderColorWithShadow' borderRadius='$4'>
        <Text color='$textPrimary' fontSize='$6' fontWeight='700'>Availability & tracking</Text>
        <DriverTrackingControl />
        <XStack gap='$4' flexWrap='wrap'>
            <Text color='$textSecondary'>Active orders: {allActiveOrders.length}</Text>
            <Text color='$textSecondary'>Speed: {typeof coords?.speed === 'number' && coords.speed >= 0 ? `${coords.speed.toFixed(1)} m/s` : 'Unavailable'}</Text>
        </XStack>
        <Button accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}>{expanded ? 'Hide location details' : 'Show location details'}</Button>
        {expanded && <YStack gap='$2'>
            <Text color='$textSecondary'>Last reported location{location?.timestamp ? ` · ${new Date(location.timestamp).toLocaleString()}` : ''}</Text>
            {['latitude', 'longitude', 'heading', 'altitude'].map(key => <Text key={key} color='$textSecondary'>{key[0].toUpperCase() + key.slice(1)}: {typeof coords?.[key] === 'number' && Number.isFinite(coords[key]) ? coords[key] : 'Unavailable'}</Text>)}
        </YStack>}
    </YStack>;
}
