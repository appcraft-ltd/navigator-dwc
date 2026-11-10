import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {Text,AppState} from 'react-native';
let mockMissingCurrent = false;
let mockRun, mockLost, mockFailBeforeCommit, mockDriver='driver_one';
const mockValues=new Map();
const mockPickupPosition=jest.fn(),mockOpenWarehouse=jest.fn();
jest.mock('../src/utils/run-pickup',()=>({...jest.requireActual('../src/utils/run-pickup'),runPickupPosition:mockPickupPosition,openOsmAnd:mockOpenWarehouse}));
const mockNavigate=jest.fn(),mockBack=jest.fn();
const mockAdapter={get:jest.fn(async(path)=>path.includes('view=current') ? (mockMissingCurrent ? {} : {run:mockRun?.accepted ? JSON.parse(JSON.stringify(mockRun)) : null}) : JSON.parse(JSON.stringify(mockRun))),post:jest.fn(async(path,data)=>{
 if(mockFailBeforeCommit) throw Error('Offline');
 mockRun={...mockRun,accepted:true,status:'in_progress',acceptance_operation_id:data.operation_id};
 if(mockLost)throw Error('Lost acknowledgement');return mockRun;
})};
jest.mock('../src/hooks/use-fleetbase',()=>()=>({adapter:mockAdapter}));
jest.mock('../src/contexts/AuthContext',()=>({useAuth:()=>({driver:{id:mockDriver}})}));
jest.mock('../src/hooks/use-storage',()=>({storage:{getString:key=>mockValues.get(key),setString:(k,v)=>mockValues.set(k,v),removeItem:k=>mockValues.delete(k)}}));
jest.mock('@react-navigation/native',()=>({useNavigation:()=>({navigate:mockNavigate,goBack:mockBack}),useFocusEffect:cb=>require('react').useEffect(cb,[cb])}));
jest.mock('uuid',()=>({v4:jest.fn(()=> 'retained-operation')}));
jest.mock('tamagui',()=>{const {View,Text}=require('react-native');const Button=p=><View {...p}>{typeof p.children==='string'?<Text>{p.children}</Text>:p.children}</View>;Button.Text=Text;return {Text,Button,YStack:View,XStack:View}});
jest.mock('react-native-webview',()=>({WebView:props=>{const {View}=require('react-native');return <View {...props}/>}}));
const Screen=require('../src/screens/DeliveryRunScreen').default;
const {runMapHtml,runDistance,runAcceptKey}=require('../src/utils/delivery-runs');
const labels=screen=>screen.root.findAllByType(Text).map(n=>n.props.children).flat().join(' ');
const button=(screen,label)=>screen.root.findAll(n=>typeof n.type==='function'&&n.props.onPress&&n.findAllByType(Text).map(x=>x.props.children).flat().join(' ')===label)[0];
let screen;
beforeEach(()=>{AppState.currentState='active';jest.clearAllMocks();mockValues.clear();mockLost=false;mockFailBeforeCommit=false;mockMissingCurrent=false;mockDriver='driver_one';mockRun={id:'manifest_one',date:'2026-11-07',status:'active',distance_m:12400,stop_count:4,accepted:false,orders:[{id:'order_second',status:'dispatched',meta:{cargodept_order_number:'DO-42'}},{id:'order_first',status:'dispatched',meta:{cargodept_order_number:'DO-41'}}],stops:[{sequence:1,order_id:'order_second',type:'pickup',name:'Warehouse',lat:25,lng:55},{sequence:2,order_id:'order_second',type:'dropoff',name:'Customer 42',lat:25.2,lng:55.3},{sequence:3,order_id:'order_first',type:'pickup',name:'Warehouse',lat:25,lng:55},{sequence:4,order_id:'order_first',type:'dropoff',name:'Customer 41',lat:25.1,lng:55.2}]}});
afterEach(async()=>{if(screen)await act(async()=>screen.unmount());screen=null});
const mount=async(current=false)=>{await act(async()=>{screen=Renderer.create(<Screen current={current} route={{params:{runId:'manifest_one'}}}/>)});};
const press=async label=>{await act(async()=>button(screen,label).props.onPress());};
test('whole run preview retains dispatcher sequence, estimated km and all stops before one accept',async()=>{
 await mount();const text=labels(screen);expect(text).toContain('~12.4 km');expect(text).toContain('4');expect(text.indexOf('DO-42')).toBeLessThan(text.indexOf('DO-41'));expect(mockAdapter.post).not.toHaveBeenCalled();
 await press('Accept delivery run');expect(mockAdapter.post).toHaveBeenCalledTimes(1);expect(mockAdapter.post).toHaveBeenCalledWith('navigator/runs/manifest_one/accept',{operation_id:'retained-operation'});
 expect(labels(screen)).not.toContain('Accept delivery run');await press('Pick Up');expect(mockNavigate).toHaveBeenCalledWith('Order',{order:mockRun.orders[0]});
});
test('lost acceptance acknowledgement recovers accepted whole run without a second POST',async()=>{
 mockLost=true;await mount();await press('Accept delivery run');expect(labels(screen)).toContain('Run accepted');expect(labels(screen)).not.toContain('Lost acknowledgement');expect(mockValues.size).toBe(0);expect(mockAdapter.post).toHaveBeenCalledTimes(1);
});
test('unaccepted offline attempt retains exact operation across retry',async()=>{
 mockFailBeforeCommit=true;await mount();await press('Accept delivery run');expect(mockValues.get(runAcceptKey('driver_one','manifest_one'))).toBe('retained-operation');
 mockFailBeforeCommit=false;await press('Accept delivery run');expect(mockAdapter.post.mock.calls[0][1]).toEqual(mockAdapter.post.mock.calls[1][1]);expect(mockValues.size).toBe(0);
});
test('route HTML never interpolates address HTML, auth or invalid coordinates',()=>{
 const html=runMapHtml([{lat:25,lng:55,name:'</script><script>bad()</script>'},{lat:null,lng:null},{lat:999,lng:55}]);expect(html).toContain('const p=[[25,55]]');expect(html).not.toContain('bad()');expect(html).not.toContain('navigator.geolocation');expect(runDistance({distance_m:null})).toBe('Distance unavailable');
});

test('Current Run opens accepted tasks directly and has no second acceptance',async()=>{
 mockRun.accepted=true;mockRun.status='in_progress';
 mockRun.orders[0].meta={cargodept_source:'cargodept-v1',cargodept_order_number:'DO-42',cargodept_packing_lists:[{number:'00123',customer_code:'QAMG-0002'}]};
 mockRun.stops[0].status='completed';await mount(true);
 const text=labels(screen);
 expect(text).toContain('Current Run');expect(text).not.toContain('Accept delivery run');
 expect(text.indexOf('QAMG-0002')).toBeLessThan(text.indexOf('PL 00123'));
 expect(text.indexOf('PL 00123')).toBeLessThan(text.indexOf('DO-42'));
 expect(button(screen,'Drop Off').props.minHeight).toBeGreaterThanOrEqual(56);
 expect(button(screen,'Pick Up')).toBeUndefined();
 expect(text).toContain('UPCOMING');
 expect(screen.root.findAll(n=>n.props.source?.html).length).toBe(0);
 await press('Drop Off');expect(mockNavigate).toHaveBeenCalledWith('Order',{order:mockRun.orders[0]});
 await press('Show route map');expect(screen.root.findAll(n=>n.props.source?.html).length).toBeGreaterThan(0);
 expect(mockAdapter.get).toHaveBeenCalledWith('navigator/runs?view=current');
});
test('known empty Current Run links to Runs without fabricating a current assignment',async()=>{
 await mount(true);expect(labels(screen)).toContain('No current run');await press('Open Runs');expect(mockNavigate).toHaveBeenCalledWith('DriverTaskTab',{screen:'DriverOrderManagement'});
});
test('an unknown current-run response stays an error, not an empty assignment',async()=>{
 mockMissingCurrent=true;await mount(true);expect(labels(screen)).toContain('Cannot refresh');expect(labels(screen)).not.toContain('No current run');
});

test('accepted CargoDept run sends a fresh fix and opens the exact warehouse in OsmAnd',async()=>{
 const location={latitude:25.04,longitude:55.12,accuracy:8,captured_at:'2026-11-07T08:00:00.000Z'};
 const warehouse={lat:24.88,lng:55.13};
 mockRun.orders.forEach(order=>{order.meta.cargodept_source='cargodept-v1';});
 mockRun.pickup_appointment={state:'pending',warehouse};
 mockPickupPosition.mockResolvedValueOnce(location);
 await mount();await press('Accept delivery run');
 expect(mockAdapter.post).toHaveBeenCalledWith('navigator/runs/manifest_one/accept',{operation_id:'retained-operation',location});
 expect(labels(screen)).toContain('Scheduling warehouse pickup');
 await press('Open warehouse in OsmAnd');
 expect(mockOpenWarehouse).toHaveBeenCalledWith(warehouse);
 expect(require('../src/utils/run-pickup').osmandUrl(warehouse)).toContain('finish=24.88,55.13&profile=car');
});
test('missing GPS leaves acceptance available for warehouse pickup review',async()=>{
 mockRun.orders[0].meta.cargodept_source='cargodept-v1';
 mockPickupPosition.mockResolvedValueOnce(undefined);
 await mount();await press('Accept delivery run');
 expect(mockAdapter.post).toHaveBeenCalledWith('navigator/runs/manifest_one/accept',{operation_id:'retained-operation'});
 expect(labels(screen)).toContain('Run accepted');
});

test('an assigned whole-trip stop shows the trip and omits multiple consignee references',async()=>{
 mockRun.accepted=true;
 mockRun.orders[0].meta={
  cargodept_source:'cargodept-v1',cargodept_order_number:'DO-42',cargodept_trip_reference:{number:'10518'},
  cargodept_packing_lists:[{number:'00123',customer_code:'ALPHA-07'},{number:'00124',customer_code:'BETA-08'}]
 };
 await mount();
 expect(labels(screen)).toContain('Trip 10518');
 expect(labels(screen)).toContain('DO-42');
 expect(labels(screen)).not.toMatch(/ALPHA-07|BETA-08|PL 00123/);
 expect(button(screen,'Pick Up')).toBeDefined();
});
