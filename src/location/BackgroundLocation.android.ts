import { NativeEventEmitter, NativeModules } from 'react-native';

// This Android adapter uses our own foreground service. No Transistorsoft native
// classes, binaries, license keys or license checks are used by this build.
const native = NativeModules.DwcLocation;
const events = new NativeEventEmitter(native);

function callbacks<T>(promise: Promise<T>, success?: (value: T) => void, failure?: (error: unknown) => void) {
    if (success || failure) promise.then(success, failure);
    return promise;
}

export default {
    DESIRED_ACCURACY_HIGH: 1,
    ready: (options, success?, failure?) => callbacks(native.configure(options), success, failure),
    start: (success?, failure?) => callbacks(native.start(), success, failure),
    stop: (success?, failure?) => callbacks(native.stop(), success, failure),
    getCurrentPosition: (_options?, success?, failure?) => callbacks(native.getCurrentPosition(), success, failure),
    onLocation: (listener, onError?) => {
        const location = events.addListener('DwcLocation', listener);
        const error = onError ? events.addListener('DwcLocationError', onError) : null;
        return { remove: () => { location.remove(); error?.remove(); } };
    },
    onMotionChange: () => ({ remove: () => {} }),
};
