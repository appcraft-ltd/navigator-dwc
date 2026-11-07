import 'react-native-get-random-values';
jest.mock('uuid', () => ({ v4: () => '11111111-1111-4111-8111-111111111111' }));
const mockValues = new Map();
const mockFs = { DocumentDirectoryPath: '/private-app', stat: jest.fn(), mkdir: jest.fn(), copyFile: jest.fn(), unlink: jest.fn() };
const mockResize = jest.fn();
const mockPosition = jest.fn();
jest.mock('react-native-fs', () => mockFs);
jest.mock('@bam.tech/react-native-image-resizer', () => ({ createResizedImage: (...args) => mockResize(...args) }));
jest.mock('../src/location/BackgroundLocation', () => ({ getCurrentPosition: (...args) => mockPosition(...args) }));
jest.mock('../src/hooks/use-storage', () => ({ storage: {
    getMap: key => mockValues.get(key), setMap: (key, value) => mockValues.set(key, value), removeItem: key => mockValues.delete(key), getAllKeys: () => [...mockValues.keys()],
} }));
const { prepareDeliveryPhoto, clearPendingDelivery, pendingKey, confirmationForm, sendMultipart, multipartHeaders } = require('../src/utils/delivery-confirmations');
let request;
class MockXHR {
    constructor() { request = this; this.headers = {}; this.upload = {}; }
    open(...args) { this.opened = args; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send(body) { this.body = body; }
}
beforeEach(() => {
    jest.clearAllMocks(); mockValues.clear(); mockValues.set('driver', { id: 'driver_one' });
    mockFs.stat.mockResolvedValue({ size: 210000 }); mockFs.mkdir.mockResolvedValue(); mockFs.copyFile.mockResolvedValue(); mockFs.unlink.mockResolvedValue();
    mockResize.mockResolvedValue({ path: '/resized.jpg', uri: 'file:///resized.jpg' });
    mockPosition.mockResolvedValue({ timestamp: new Date().toISOString(), coords: { latitude: 25.1, longitude: 55.2, accuracy: 9 } });
    global.XMLHttpRequest = MockXHR;
    global.FormData = require('react-native/Libraries/Network/FormData').default;
});
test('photo is bounded, uses fresh GPS and persists a scoped retry without base64', async () => {
    const key = pendingKey('driver_one', 'order_one');
    const pending = await prepareDeliveryPhoto({ uri: 'file:///capture.jpg', capturedAt: new Date().toISOString() }, 'pickup', key);
    expect(pending).toMatchObject({ latitude: 25.1, longitude: 55.2, accuracy: 9, bytes: 210000, stage: 'pickup', attempted: false });
    expect(mockValues.get(key)).toEqual(pending);
    expect(mockResize.mock.calls[0].slice(1, 5)).toEqual([1280, 1280, 'JPEG', 78]);
    expect(confirmationForm(pending).getParts().find(p => p.fieldName === 'photo')).toMatchObject({ uri: `file://${pending.path}`, type: 'image/jpeg' });
});
test.each([null, { timestamp: new Date(Date.now()-3600000).toISOString(), coords: {latitude:25,longitude:55,accuracy:10} }, { timestamp: new Date().toISOString(), coords:{ latitude:25,longitude:55,accuracy:800 } }])('missing or stale/imprecise GPS never saves a confirmation', async location => {
    mockPosition.mockResolvedValue(location || {});
    const key = pendingKey('driver_one', 'order_one');
    await expect(prepareDeliveryPhoto({ uri: 'capture.jpg' }, 'pickup', key)).rejects.toThrow();
    expect(mockValues.has(key)).toBe(false);
});
test('logout during GPS acquisition cannot persist private proof after cleanup', async () => {
    mockPosition.mockImplementation(async () => { mockValues.delete('driver'); return { timestamp: new Date().toISOString(), coords:{latitude:25,longitude:55,accuracy:10} }; });
    const key = pendingKey('driver_one', 'order_one');
    await expect(prepareDeliveryPhoto({ uri:'capture.jpg' }, 'pickup', key)).rejects.toThrow('session changed');
    expect(mockValues.has(key)).toBe(false);
});
test('logout removes retained photos without deleting other app files', async () => {
    mockValues.set('delivery-confirmation:driver_one:order_one', { path:'/private-app/delivery-confirmations/one.jpg' });
    mockValues.set('delivery-confirmation:driver_one:order_one:accept', 'operation');
    mockValues.set('unrelated', 'keep');
    await clearPendingDelivery();
    expect(mockValues.has('delivery-confirmation:driver_one:order_one')).toBe(false);
    expect(mockValues.get('unrelated')).toBe('keep');
    expect(mockFs.unlink).toHaveBeenCalledWith('/private-app/delivery-confirmations/one.jpg');
});
test('multipart uses native binary body/boundary, reports actual upload progress and waits for server receipt', async () => {
    const form = new FormData(); form.append('operation_id', 'one'); const progress = jest.fn();
    const pending = sendMultipart({ host:'https://example.test/', namespace:'v1', headers:{Authorization:'Bearer synthetic', 'Content-Type':'application/json'} }, 'navigator/orders/one/delivery/pickup', form, progress);
    expect(request.body).toBe(form); expect(request.headers['Content-Type']).toBeUndefined();
    expect(request.opened).toEqual(['POST','https://example.test/v1/navigator/orders/one/delivery/pickup']);
    request.upload.onprogress({lengthComputable:true,loaded:50,total:100}); expect(progress).toHaveBeenCalledWith(50);
    request.status=200; request.responseText=JSON.stringify({next:'dropoff'}); request.onload();
    await expect(pending).resolves.toEqual({next:'dropoff'});
});
test('network timeout is an unknown result and retains exact pending evidence', async () => {
    const key = pendingKey('driver_one','order_one'); mockValues.set(key,{operationId:'fixed',path:'/private-app/delivery-confirmations/fixed.jpg'});
    const pending = sendMultipart({host:'https://example.test',headers:{Authorization:'Bearer synthetic'}},'step',new FormData()); request.ontimeout();
    await expect(pending).rejects.toThrow('Retry'); expect(mockValues.get(key).operationId).toBe('fixed');
});
test('Axios SDK credentials are included even when adapter.headers is empty', async () => {
    const adapter = { host:'https://example.test', headers:{}, axiosInstance:{defaults:{headers:{Authorization:'Bearer initial',common:{authorization:'Bearer current'},'Content-Type':'application/json'}}} };
    const pending = sendMultipart(adapter, 'step', new FormData());
    expect(request.headers.authorization).toBe('Bearer current');
    expect(request.headers.common).toBeUndefined(); expect(request.headers['content-type']).toBeUndefined();
    request.status=200;request.responseText='{}';request.onload();await expect(pending).resolves.toEqual({});
});
test('missing credentials fail before any photo bytes are sent', async () => {
    request = null;
    await expect(sendMultipart({host:'https://example.test',headers:{}},'step',new FormData())).rejects.toThrow('Sign in again');
    expect(request).toBeNull();
    expect(multipartHeaders({headers:{Authorization:'Bearer browser'}}).get('authorization')).toBe('Bearer browser');
});
