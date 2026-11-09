import { Linking, NativeModules, Platform } from 'react-native';

const coordinates = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);

export async function runPickupPosition() {
    try {
        const fix = Platform.OS === 'android'
            ? await NativeModules.DwcLocation?.getPickupPosition?.()
            : Platform.OS === 'ios'
                ? await (await import('../location/BackgroundLocation')).default.getCurrentPosition({ timeout: 4 })
                : undefined;
        if (!fix) return undefined;
        const { latitude, longitude, accuracy } = fix.coords ?? {};
        const at = Date.parse(fix.timestamp);
        if (!coordinates(latitude, longitude) || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100 ||
            !Number.isFinite(at) || Math.abs(Date.now() - at) > 120000) return undefined;
        return { latitude, longitude, accuracy, captured_at: new Date(at).toISOString() };
    } catch {
        return undefined;
    }
}

export function osmandUrl(warehouse: {lat:number; lng:number}) {
    const { lat, lng } = warehouse ?? {};
    if (!coordinates(lat, lng)) throw new Error('Warehouse location unavailable.');
    const destination = lat + ',' + lng;
    return 'https://osmand.net/map/?finish=' + destination + '&profile=car&pin=' + destination + '#16/' + lat + '/' + lng;
}

export async function openOsmAnd(warehouse: {lat:number; lng:number}) {
    const url = osmandUrl(warehouse);
    if (Platform.OS === 'android') await NativeModules.DwcLocation.openOsmAnd(url);
    else await Linking.openURL(url);
}

export function pickupTime(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
