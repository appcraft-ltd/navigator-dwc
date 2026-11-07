import React, { useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import TrackingMarker from './TrackingMarker';
import useSocketClusterClient from '../hooks/use-socket-cluster-client';
import useEventBuffer from '../hooks/use-event-buffer';
import { placeCoordinate } from '../utils/known-coordinates';

const DriverMarker = ({ driver, onPositionChange, onHeadingChange, onMovement, ...props }) => {
    const markerRef = useRef();
    const listenerRef = useRef();
    const handleEvent = useCallback((data) => {
        const movementData: any = { data };
        const coordinate = placeCoordinate(data);

        if (coordinate) {
            const { latitude, longitude } = coordinate;
            if (markerRef.current) {
                markerRef.current.move(latitude, longitude);
            }

            if (typeof onPositionChange === 'function') {
                onPositionChange({ latitude, longitude });
            }

            movementData.coordinates = coordinate;
        }

        if (Number.isFinite(data?.heading)) {
            if (markerRef.current) {
                markerRef.current.rotate(data.heading);
            }

            if (typeof onHeadingChange === 'function') {
                onHeadingChange(data.heading);
            }

            movementData.heading = data.heading;
        }

        if (typeof onMovement === 'function') {
            onMovement(movementData);
        }
    }, [onPositionChange, onHeadingChange, onMovement]);
    const { listen } = useSocketClusterClient();
    const { addEvent, clearEvents } = useEventBuffer(handleEvent);

    useFocusEffect(
        useCallback(() => {
            const trackDriverMovement = async () => {
                const listener = await listen(`driver.${driver.id}`, (event) => addEvent(event));
                if (listener) {
                    listenerRef.current = listener;
                }
            };

            trackDriverMovement();

            return () => {
                if (listenerRef.current) {
                    listenerRef.current.stop();
                }
                clearEvents();
            };
        }, [listen, driver.id])
    );

    const coordinate = placeCoordinate(driver);
    if (!coordinate) return null;
    return (
        <TrackingMarker
            ref={markerRef}
            coordinate={coordinate}
            imageSource={{ uri: driver.getAttribute('vehicle_avatar') }}
            size={{ width: 50, height: 50 }}
            {...props}
        />
    );
};

export default DriverMarker;
