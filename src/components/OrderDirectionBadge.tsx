import React from 'react';
import { Text, XStack } from 'tamagui';

export function orderOperation(order: any): 'delivery' | 'collection' | undefined {
    const meta = typeof order?.getAttribute === 'function' ? order.getAttribute('meta') : order?.meta;
    if (meta?.cargodept_source !== 'cargodept-v1') return undefined;
    if (meta.operation === 'delivery' || meta.operation === 'collection') return meta.operation;
}

export default function OrderDirectionBadge({ order, operation, count }: { order?: unknown; operation?: 'delivery' | 'collection'; count?: number }) {
    const direction = operation ?? orderOperation(order);
    if (!direction) return null;

    const collection = direction === 'collection';
    const label = collection ? 'Collection' : 'Delivery';
    const terminal = collection ? 'to FFS DWC' : 'from FFS DWC';
    return (
        <XStack alignSelf='flex-start' borderRadius={6} px={8} py={3} backgroundColor={collection ? '#fef3c7' : '#dbeafe'} testID={'order-direction-' + direction}>
            <Text color={collection ? '#78350f' : '#1e3a8a'} fontSize={12} lineHeight={16} fontWeight='700' accessibilityLabel={count === undefined ? label + ', ' + terminal : count + ' ' + label + ', ' + terminal}>
                {count === undefined ? label : label + ' · ' + count}
            </Text>
        </XStack>
    );
}
