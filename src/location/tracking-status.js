export function trackingStatus({ isOnline, isTracking, permissionStatus, trackingError, pending, toggleError }) {
    if (pending) return { label: 'Updating…', detail: 'Please wait while your availability changes.', color: '$textSecondary' };
    if (toggleError) return { label: 'Could not update', detail: 'Your previous setting is still active. Check your connection and try again.', color: '$red-500' };
    if (!isOnline) return { label: 'Off', detail: 'Your location is not being shared.', color: '$textSecondary' };
    if (permissionStatus !== 'granted') return { label: 'Permission needed', detail: 'Allow precise location in Android Settings to start tracking.', color: '$red-500' };
    if (trackingError) {
        const messages = {
            LOCATION_UPLOAD_UNAVAILABLE: 'GPS is running, but location updates cannot reach dispatch. Check your connection.',
            LOCATION_SESSION_EXPIRED: 'Your session has expired. Sign in again to resume tracking.',
            LOCATION_PERMISSION: 'Allow precise location in Android Settings to start tracking.',
            LOCATION_TIMEOUT: 'A current GPS location is unavailable. Check that Location is enabled on your phone.',
            LOCATION_UNAVAILABLE: 'A current GPS location is unavailable. Check that Location is enabled on your phone.',
        };
        return { label: 'Error', detail: messages[trackingError] || 'Location sharing could not start. Turn it off and on to try again.', color: '$red-500' };
    }
    return isTracking
        ? { label: 'On', detail: 'Location sharing is active.', color: '$green-500' }
        : { label: 'Starting…', detail: 'Waiting for the location service to start.', color: '$textSecondary' };
}
