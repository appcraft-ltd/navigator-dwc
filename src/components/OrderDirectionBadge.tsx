import React from 'react';
import { Text, XStack } from 'tamagui';
import { dubaiDay } from '../utils/dubai-dates';

type Operation = 'delivery' | 'collection';

function orderAttribute(order: any, key: string) {
    return typeof order?.getAttribute === 'function' ? order.getAttribute(key) : order?.[key];
}

export function orderOperation(order: unknown): Operation | undefined {
    const meta = orderAttribute(order, 'meta');
    if (meta?.cargodept_source !== 'cargodept-v1') return undefined;
    if (meta.operation === 'delivery' || meta.operation === 'collection') return meta.operation;
}

export function orderIsNew(order: unknown, today = dubaiDay(new Date())) {
    const status = orderAttribute(order, 'status');
    return !!today && status !== 'canceled' && status !== 'cancelled'
        && dubaiDay(orderAttribute(order, 'dispatched_at')) === today;
}

export default function OrderDirectionBadge({ order, operation, count, isNew = orderIsNew(order) }: {
    order?: unknown; operation?: Operation; count?: number; isNew?: boolean;
}) {
    const direction = operation ?? orderOperation(order);
    if (!direction) return null;

    const collection = direction === 'collection';
    const directionLabel = collection ? 'Collection' : 'Delivery';
    const label = isNew ? 'New ' + directionLabel.toLowerCase() : directionLabel;
    const color = collection ? '#78350f' : '#1e3a8a';
    const terminal = collection ? 'to FFS DWC' : 'from FFS DWC';
    return (
        <XStack alignSelf='flex-start' borderRadius={6} px={8} py={3} borderWidth={isNew ? 1 : 0} borderColor={color} backgroundColor={collection ? '#fef3c7' : '#dbeafe'} testID={'order-direction-' + direction}>
            <Text color={color} fontSize={12} lineHeight={16} fontWeight='700' accessibilityLabel={count === undefined ? label + ', ' + terminal : count + ' ' + label + ', ' + terminal}>
                {count === undefined ? label : label + ' · ' + count}
            </Text>
        </XStack>
    );
}
