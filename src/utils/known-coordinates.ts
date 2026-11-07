export type Coordinate = { latitude: number; longitude: number };

export function knownCoordinate(latitude: unknown, longitude: unknown): Coordinate | null {
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)
        || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return { latitude, longitude };
}

export function locationCoordinate(location: any): Coordinate | null {
    return knownCoordinate(location?.coords?.latitude, location?.coords?.longitude);
}

// GeoJSON is longitude first. Missing positions stay unknown; a warehouse or
// default-map coordinate must never stand in for a driver's actual position.
export function placeCoordinate(place: any): Coordinate | null {
    const point = typeof place?.getAttribute === 'function' ? place.getAttribute('location') : place?.location;
    if (!Array.isArray(point?.coordinates) || point.coordinates.length !== 2) return null;
    return knownCoordinate(point.coordinates[1], point.coordinates[0]);
}
