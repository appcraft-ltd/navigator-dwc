import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Text,AppState} from 'react-native';
const mockNavigate=jest.fn();
const mockAdapter={get:jest.fn(async path=>({runs:[{id:path.includes('history')?'manifest_past':'manifest_new',date:'2026-11-07',status:path.includes('history')?'completed':'active',accepted:false,stop_count:4,order_count:2,distance_m:20000}],page:1,has_more:false}))};
jest.mock('../src/hooks/use-fleetbase',()=>()=>({adapter:mockAdapter}));
jest.mock('../src/contexts/AuthContext',()=>({useAuth:()=>({driver:{id:'driver_one'}})}));
jest.mock('@react-navigation/native',()=>({useNavigation:()=>({navigate:mockNavigate}),useFocusEffect:cb=>require('react').useEffect(cb,[cb])}));
jest.mock('tamagui',()=>{const {View,Text}=require('react-native');const Button=p=><View {...p}>{typeof p.children==='string'?<Text>{p.children}</Text>:p.children}</View>;return {Button,Text,YStack:View,XStack:View}});
const Screen=require('../src/screens/DeliveryRunsScreen').default;
let screen;
const label=()=>screen.root.findAllByType(Text).map(n=>n.props.children).flat().join(' ');
const press=async title=>{const button=screen.root.findAll(n=>typeof n.type==='function'&&n.props.onPress&&n.findAllByType(Text).map(x=>x.props.children).flat().join(' ')===title)[0];await act(async()=>button.props.onPress());};
beforeEach(()=>{AppState.currentState='active';jest.clearAllMocks();});
afterEach(async()=>{if(screen)await act(async()=>screen.unmount());screen=null;});
test('Runs fetches lightweight active rows, switches to past runs and opens their actual run ID',async()=>{
 await act(async()=>{screen=Renderer.create(<Screen/>)});expect(mockAdapter.get).toHaveBeenLastCalledWith('navigator/runs?summary=1&view=active&page=1');expect(label()).toContain('New run');
 await press('Past runs');expect(mockAdapter.get).toHaveBeenLastCalledWith('navigator/runs?summary=1&view=history&page=1');expect(label()).toContain('Completed');expect(label()).not.toContain('New run');
 await press('View run');expect(mockNavigate).toHaveBeenCalledWith('DeliveryRun',{runId:'manifest_past'});
});
test('late active response cannot replace the selected history',async()=>{
 let resolveActive;mockAdapter.get.mockImplementationOnce(()=>new Promise(resolve=>{resolveActive=resolve}));
 await act(async()=>{screen=Renderer.create(<Screen/>)});await press('Past runs');
 await act(async()=>resolveActive({runs:[{id:'late-active',status:'active',order_count:99}],page:1,has_more:false}));
 expect(label()).toContain('Completed');expect(label()).not.toContain('late-active');
});
