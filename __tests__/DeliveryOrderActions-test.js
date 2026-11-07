import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Text,View} from 'react-native';
const mockValues=new Map(),mockListeners=new Set();
const mockWrite=(key,value)=>{if(value===undefined)mockValues.delete(key);else mockValues.set(key,value);for(const f of mockListeners)f();};
let mockState,mockUploadFails=false;
const mockAdapter={get:jest.fn(async()=>JSON.parse(JSON.stringify(mockState))),post:jest.fn(async(path,data)=>{
 mockState={...mockState,next:'pickup',step_key:'pickup',order:{id:'order_one',status:'started'},receipts:{accept:{operation_id:data.operation_id}}};return mockState;
})};
jest.mock('../src/hooks/use-fleetbase',()=>()=>({adapter:mockAdapter}));
jest.mock('../src/contexts/AuthContext',()=>({useAuth:()=>({driver:{id:'driver_one'}})}));
jest.mock('uuid',()=>({v4:()=> 'accept-operation'}));
jest.mock('@fleetbase/sdk',()=>({Order:class{constructor(data){Object.assign(this,data)}}}));
jest.mock('@react-navigation/native',()=>({useFocusEffect:callback=>require('react').useEffect(callback,[callback])}));
jest.mock('tamagui',()=>{
 const {View,Text}=require('react-native');const Button=props=><View {...props}/>;Button.Text=Text;
 return {Button,Text,YStack:View,XStack:View,Image:View};
});
jest.mock('../src/components/CameraCapture',()=>function CameraCapture(){return null;});
jest.mock('../src/hooks/use-storage',()=>({__esModule:true,default:key=>{
 const React=require('react');const value=React.useSyncExternalStore(cb=>{mockListeners.add(cb);return()=>mockListeners.delete(cb)},()=>mockValues.get(key));return[value,value=>mockWrite(key,value)];
},storage:{getMap:key=>mockValues.get(key),setMap:mockWrite,getString:key=>mockValues.get(key),setString:mockWrite,removeItem:key=>mockWrite(key,undefined)}}));
jest.mock('../src/utils/delivery-confirmations',()=>({
 pendingKey:(d,o)=>`delivery-confirmation:${d}:${o}`,
 prepareDeliveryPhoto:jest.fn(async(photo,stage,key,stepKey)=>mockWrite(key,{stage,stepKey,operationId:'photo-operation-'+stage,path:'/photo.jpg',accuracy:8,bytes:120000,attempted:false})),
 discardDeliveryPhoto:jest.fn(async key=>mockWrite(key,undefined)),confirmationForm:pending=>pending,
 sendMultipart:jest.fn(async(adapter,path,saved,progress)=>{
  progress(50);progress(100);
  mockState={...mockState,next:saved.stage==='pickup'?'dropoff':null,step_key:'dropoff',terminal:saved.stage==='dropoff',order:{id:'order_one',status:saved.stage==='pickup'?'enroute':'completed'},
   receipts:{...mockState.receipts,[saved.stepKey]:{operation_id:saved.operationId}},proofs:{...mockState.proofs,[saved.stepKey]:{url:'https://example.test/photo.jpg',data:{stage:saved.stage,captured_at:new Date().toISOString(),accuracy:8}}}};
  if(mockUploadFails)throw Error('Connection interrupted');return mockState;
 })
}));
const DeliveryActions=require('../src/components/DeliveryOrderActions').default;
const Capture=require('../src/components/CameraCapture');
const utils=require('../src/utils/delivery-confirmations');
const label=screen=>screen.root.findAllByType(Text).map(n=>n.props.children).flat().join(' ');
const button=(screen,title)=>screen.root.findAll(n=>typeof n.type==='function' && n.props.onPress && n.findAllByType(Text).map(x=>x.props.children).flat().join(' ')===title)[0];
let screen;
beforeEach(()=>{jest.clearAllMocks();mockValues.clear();mockListeners.clear();mockUploadFails=false;mockState={enabled:true,next:'accept',step_key:'accept',terminal:false,receipts:{},proofs:{},order:{id:'order_one',status:'dispatched'}}});
afterEach(async()=>{if(screen)await act(async()=>screen.unmount());screen=null;});
async function mount(){await act(async()=>{screen=Renderer.create(<DeliveryActions order={{id:'order_one'}} onOrder={()=>{}} onManaged={()=>{}}/>)});}
async function press(title){await act(async()=>button(screen,title).props.onPress());}
async function photo(){await act(async()=>screen.root.findByType(Capture).props.onDone([{uri:'capture.jpg'}]));}
test('explicit Accept, Pickup photo/GPS and Drop off photo/GPS remain separate steps',async()=>{
 await mount();expect(label(screen)).toContain('Accept order');await press('Accept order');
 expect(label(screen)).toContain('Confirm pickup');await press('Confirm pickup');await photo();
 expect(label(screen)).toMatch(/GPS ±\s*8\s*m/);expect(utils.sendMultipart).not.toHaveBeenCalled();
 await press('Send pickup confirmation');expect(label(screen)).toContain('Pickup confirmed');expect(label(screen)).toContain('Confirm drop off');
 await press('Confirm drop off');await photo();await press('Send drop off confirmation');
 expect(label(screen)).toContain('Delivery completed');expect(label(screen)).toContain('Drop off confirmed');expect(utils.sendMultipart).toHaveBeenCalledTimes(2);
});
test('a lost upload response is recovered by receipt readback without duplicate submission',async()=>{
 await mount();await press('Accept order');await press('Confirm pickup');await photo();mockUploadFails=true;
 await press('Send pickup confirmation');expect(label(screen)).toContain('Pickup confirmed');expect(label(screen)).not.toContain('Connection interrupted');expect(utils.sendMultipart).toHaveBeenCalledTimes(1);
});
test('photo/GPS preparation failure cannot expose a send button or advance the stage',async()=>{
 utils.prepareDeliveryPhoto.mockRejectedValueOnce(Error('GPS unavailable'));await mount();await press('Accept order');await press('Confirm pickup');await photo();
 expect(label(screen)).toContain('GPS unavailable');expect(label(screen)).toContain('Confirm pickup');expect(utils.sendMultipart).not.toHaveBeenCalled();
});
test('a run member cannot expose individual acceptance before the run is accepted',async()=>{
 mockState={...mockState,next:null,run:{id:'manifest_one',accepted:false,blocked_reason:'Open and accept the whole delivery run first.'}};
 await mount();expect(label(screen)).toContain('accept the whole delivery run');expect(label(screen)).not.toContain('Accept order');expect(mockAdapter.post).not.toHaveBeenCalled();
});
test('accepted run members start directly at photo/GPS pickup',async()=>{
 mockState={...mockState,next:'pickup',step_key:'pickup',run:{id:'manifest_one',accepted:true},receipts:{accept:{run_id:'manifest_one'}}};
 await mount();expect(label(screen)).toContain('Confirm pickup');expect(label(screen)).not.toContain('Accept order');await press('Confirm pickup');await photo();await press('Send pickup confirmation');expect(mockAdapter.post).not.toHaveBeenCalled();expect(utils.sendMultipart).toHaveBeenCalledTimes(1);
});
