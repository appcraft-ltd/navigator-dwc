import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text, AppState, RefreshControl } from 'react-native';
const mockNavigate = jest.fn();
let mockDriverId = 'driver_one';
const mockOrders = Array.from({length: 6}, (_, i) => ({
    id: `order_${i}`, status: i === 3 ? 'enroute' : 'dispatched',
    created_at: i < 3 ? '2026-11-11T10:23:00Z' : '2026-11-10T10:12:00Z',
    meta: { cargodept_source: 'cargodept-v1', cargodept_order_number: `DO-${84 - i}`, cargodept_packing_lists: [{ customer_code: 'QECA-0001', number: `${285156 + i}` }] },
    payload: { pickup: {name: 'FFS DWC'}, dropoff: {name: `Destination ${i + 1}`} },
}));
const mockResponse = async path => path === 'orders' ? mockOrders : ({runs:[{id:path.includes('history')?'manifest_past':'manifest_new',date:'2026-11-07',status:path.includes('history')?'completed':'active',accepted:false,stop_count:4,order_count:2,distance_m:20000}],page:1,has_more:false});
const mockAdapter = { get: jest.fn(mockResponse) };
jest.mock('../src/hooks/use-fleetbase', () => () => ({adapter: mockAdapter}));
jest.mock('../src/contexts/AuthContext', () => ({useAuth: () => ({driver: mockDriverId ? {id: mockDriverId} : null})}));
jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate}), useFocusEffect: cb => require('react').useEffect(cb, [cb])}));
jest.mock('tamagui', () => {const {View,Text} = require('react-native'); const Button = p => <View {...p}>{typeof p.children === 'string' ? <Text>{p.children}</Text> : p.children}</View>; return {Button,Text,YStack:View,XStack:View};});
const Screen = require('../src/screens/DeliveryRunsScreen').default;
let screen;
const label = () => screen.root.findAllByType(Text).map(n => n.props.children).flat().join(' ');
const press = async title => {const button = screen.root.findAll(n => typeof n.type === 'function' && n.props.onPress && n.findAllByType(Text).map(x=>x.props.children).flat().join(' ') === title)[0]; await act(async () => button.props.onPress());};
beforeEach(() => {AppState.currentState = 'active'; mockDriverId = 'driver_one'; jest.clearAllMocks(); mockAdapter.get.mockImplementation(mockResponse);});
afterEach(async () => {if (screen) await act(async () => screen.unmount()); screen = null;});

test('opens assigned orders directly on home, including previous days, when no run exists', async () => {
    mockAdapter.get.mockImplementation(async path => path === 'orders' ? mockOrders : {runs:[], page:1, has_more:false});
    await act(async () => {screen = Renderer.create(<Screen/>);});
    expect(mockAdapter.get).toHaveBeenCalledWith('orders', {driver_assigned:'driver_one',active:true,limit:-1,sort:'-created_at'});
    for (let i=0; i<6; i++) expect(label()).toContain(`DO-${84-i}`);
    expect(label()).toContain('In progress');
    expect(label()).not.toContain('No active assignments');
    expect(label()).not.toContain('Standalone orders');
    expect(label()).not.toContain('No delivery runs assigned');
    await press('Open order');
    expect(mockNavigate).toHaveBeenCalledWith('Order', {order: mockOrders[0]});
});

test('run members stay in their run while other orders remain directly visible', async () => {
    mockAdapter.get.mockImplementation(async path => path === 'orders' ? [...mockOrders, {...mockOrders[0], id:'order_member', meta:{navigator_run_id:'manifest_new'}}] : mockResponse(path));
    await act(async () => {screen = Renderer.create(<Screen/>);});
    expect(label()).toContain('Orders ·  6');
    expect(label()).not.toContain('order_member');
    await press('Open delivery run');
    expect(mockNavigate).toHaveBeenCalledWith('DeliveryRun', {runId:'manifest_new'});
    await press('Past runs');
    expect(mockAdapter.get).toHaveBeenLastCalledWith('navigator/runs?summary=1&view=history&page=1');
    expect(label()).toContain('Completed');
    expect(label()).not.toContain('DO-84');
    await press('View run');
    expect(mockNavigate).toHaveBeenCalledWith('DeliveryRun', {runId:'manifest_past'});
});

test('run failure does not hide orders and order failure is not displayed as an empty assignment list', async () => {
    mockAdapter.get.mockImplementation(async path => {if (path !== 'orders') throw new Error('Unavailable'); return mockOrders;});
    await act(async () => {screen = Renderer.create(<Screen/>);});
    expect(label()).toContain('DO-84');
    expect(label()).toContain('Cannot load delivery runs');
    mockAdapter.get.mockImplementation(async path => {if (path === 'orders') throw new Error('Unavailable'); return {runs:[],page:1,has_more:false};});
    await act(async () => screen.root.findByType(RefreshControl).props.onRefresh());
    expect(label()).toContain('Cannot refresh assigned orders');
    expect(label()).toContain('DO-84');
    expect(label()).not.toContain('No active assignments');
});

test('malformed orders are an explicit error, while a successful empty pair shows one empty state', async () => {
    mockAdapter.get.mockImplementation(async path => path === 'orders' ? {data:mockOrders} : {runs:[],page:1,has_more:false});
    await act(async () => {screen = Renderer.create(<Screen/>);});
    expect(label()).toContain('Cannot refresh assigned orders');
    expect(label()).not.toContain('No active assignments');
    mockAdapter.get.mockImplementation(async path => path === 'orders' ? [] : {runs:[],page:1,has_more:false});
    await act(async () => screen.root.findByType(RefreshControl).props.onRefresh());
    expect(label()).toContain('No active assignments yet.');
    expect(label()).not.toContain('Cannot refresh');
});

test('late active response cannot replace selected history', async () => {
    let resolveActive;
    mockAdapter.get.mockImplementationOnce(() => new Promise(resolve => {resolveActive = resolve;}));
    await act(async () => {screen = Renderer.create(<Screen/>);});
    await press('Past runs');
    await act(async () => resolveActive({runs:[{id:'late-active',status:'active',order_count:99}],page:1,has_more:false}));
    expect(label()).toContain('Completed'); expect(label()).not.toContain('late-active');
});

test('driver change hides old assignments and ignores their delayed response', async () => {
    let resolveOrders;
    mockAdapter.get.mockImplementation(async path => path === 'orders' ? new Promise(resolve => {resolveOrders = resolve;}) : {runs:[],page:1,has_more:false});
    await act(async () => {screen = Renderer.create(<Screen/>);});
    mockDriverId = 'driver_two';
    mockAdapter.get.mockImplementation(async path => path === 'orders' ? [] : {runs:[],page:1,has_more:false});
    await act(async () => screen.update(<Screen/>));
    await act(async () => resolveOrders(mockOrders));
    expect(mockAdapter.get).toHaveBeenCalledWith('orders', expect.objectContaining({driver_assigned:'driver_two'}));
    expect(label()).not.toContain('DO-84');
    expect(label()).toContain('No active assignments yet.');
});
