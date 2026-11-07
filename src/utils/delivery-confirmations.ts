import RNFS from 'react-native-fs';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import BackgroundLocation from '../location/BackgroundLocation';
import { storage } from '../hooks/use-storage';

export const DELIVERY_PENDING_PREFIX = 'delivery-confirmation:';
const directory = `${RNFS.DocumentDirectoryPath}/delivery-confirmations`;
export const pendingKey = (driverId: string, orderId: string) => `${DELIVERY_PENDING_PREFIX}${driverId}:${orderId}`;

export function multipartHeaders(adapter) {
    // RN selects the SDK's Axios adapter, whose credentials live in defaults,
    // whereas the browser adapter keeps them directly in headers.
    const headers = new Map<string, string>();
    for (const source of [adapter.axiosInstance?.defaults?.headers, adapter.axiosInstance?.defaults?.headers?.common, adapter.headers]) {
        for (const [name, value] of Object.entries(source || {})) {
            if (typeof value === 'string' && !['content-type', 'content-length', 'user-agent'].includes(name.toLowerCase())) headers.set(name.toLowerCase(), value);
        }
    }
    if (!headers.get('authorization')?.trim()) throw new Error('Sign in again before uploading your photo. Your photo is saved.');
    headers.set('accept', 'application/json');
    return headers;
}

export function sendMultipart(adapter, path: string, form: FormData, onProgress = (_value: number | null) => {}) {
    return new Promise<any>((resolve, reject) => {
        const headers = multipartHeaders(adapter);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${adapter.host.replace(/\/$/, '')}/${adapter.namespace || 'v1'}/${path}`);
        xhr.timeout = 60000;
        // Native networking supplies the multipart boundary. The SDK's JSON
        // adapter must never serialize FormData or set Content-Type here.
        for (const [name, value] of headers) xhr.setRequestHeader(name, value);
        xhr.upload.onprogress = (event) => onProgress(event.lengthComputable ? Math.round(100 * event.loaded / event.total) : null);
        xhr.onload = () => {
            let result;
            try { result = JSON.parse(xhr.responseText); } catch { return reject(new Error('No confirmation received. Check the order and retry.')); }
            if (xhr.status >= 200 && xhr.status < 300) resolve(result);
            else reject(Object.assign(new Error(result.message || result.error || Object.values(result.errors || {}).flat()[0] || 'Unable to confirm this step.'), { status: xhr.status }));
        };
        xhr.onerror = xhr.ontimeout = xhr.onabort = () => reject(new Error('Connection interrupted. Your photo is saved. Retry to check the confirmation.'));
        xhr.send(form);
    });
}

export async function prepareDeliveryPhoto(photo, stage: string, key: string, stepKey = stage) {
    const actor = (storage.getMap('driver') as any)?.id;
    if (!actor || !key.startsWith(`${DELIVERY_PENDING_PREFIX}${actor}:`)) throw new Error('Sign in again before confirming delivery.');
    const capturedAt = photo.capturedAt || new Date().toISOString();
    const resized = await ImageResizer.createResizedImage(photo.uri, 1280, 1280, 'JPEG', 78, 0, undefined, false, { mode: 'contain', onlyScaleDown: true });
    let path;
    try {
        const info = await RNFS.stat(resized.path);
        if (!Number.isFinite(Number(info.size)) || Number(info.size) < 1 || Number(info.size) > 2 * 1024 * 1024) throw new Error('Photo is too large. Please take another photo.');
        const location = await BackgroundLocation.getCurrentPosition({ timeout: 20 });
        const { latitude, longitude, accuracy } = location.coords || {};
        if (![latitude, longitude, accuracy, Date.parse(capturedAt), Date.parse(location.timestamp)].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0 || accuracy > 500
            || Math.abs(Date.parse(capturedAt) - Date.parse(location.timestamp)) > 120000) throw new Error('A fresh GPS position is required. Check location permission and try again outdoors.');
        const operationId = require('uuid').v4();
        await RNFS.mkdir(directory);
        path = `${directory}/${operationId}.jpg`;
        await RNFS.copyFile(resized.path, path);
        if ((storage.getMap('driver') as any)?.id !== actor) throw new Error('Driver session changed. Please reopen the order.');
        const pending = { operationId, stage, stepKey, path, capturedAt, locationAt: location.timestamp, latitude, longitude, accuracy, bytes: Number(info.size), attempted: false };
        storage.setMap(key, pending);
        return pending;
    } catch (error) {
        if (path) await RNFS.unlink(path).catch(() => {});
        throw error;
    } finally {
        await RNFS.unlink(resized.path).catch(() => {});
    }
}

export async function discardDeliveryPhoto(key: string) {
    const pending = storage.getMap(key) as any;
    storage.removeItem(key);
    if (pending?.path?.startsWith(directory + '/')) await RNFS.unlink(pending.path).catch(() => {});
}

export function clearPendingDelivery() {
    const cleanup = [];
    for (const key of storage.getAllKeys()) if (key.startsWith(DELIVERY_PENDING_PREFIX)) {
        const saved = storage.getMap(key) as any;
        storage.removeItem(key);
        if (saved?.path?.startsWith(directory + '/')) cleanup.push(RNFS.unlink(saved.path).catch(() => {}));
    }
    return Promise.all(cleanup);
}

export function confirmationForm(pending) {
    const form = new FormData();
    for (const [name, value] of Object.entries({ operation_id: pending.operationId, step_key: pending.stepKey || pending.stage, captured_at: pending.capturedAt, location_at: pending.locationAt,
        latitude: pending.latitude, longitude: pending.longitude, accuracy: pending.accuracy })) form.append(name, String(value));
    form.append('photo', { uri: `file://${pending.path}`, type: 'image/jpeg', name: `${pending.stage}.jpg` } as any);
    return form;
}
