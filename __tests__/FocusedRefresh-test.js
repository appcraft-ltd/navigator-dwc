import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {AppState} from 'react-native';
import useFocusedRefresh from '../src/hooks/use-focused-refresh';
jest.mock('@react-navigation/native',()=>({useFocusEffect:cb=>require('react').useEffect(cb,[cb])}));
let screen,listener,remove;
function Harness({load}){useFocusedRefresh(load,30000);return null;}
beforeEach(()=>{jest.useFakeTimers();AppState.currentState='active';remove=jest.fn();jest.spyOn(AppState,'addEventListener').mockImplementation((event,fn)=>{listener=fn;return {remove}});});
afterEach(async()=>{if(screen)await act(async()=>screen.unmount());screen=null;jest.restoreAllMocks();jest.useRealTimers();AppState.currentState=null;});
test('focused polling pauses in background, resumes once, and removes its timer/listener',async()=>{
 const load=jest.fn(async()=>{});await act(async()=>{screen=Renderer.create(<Harness load={load}/>)});expect(load).toHaveBeenCalledTimes(1);
 await act(async()=>{AppState.currentState='background';listener('background');jest.advanceTimersByTime(90000)});expect(load).toHaveBeenCalledTimes(1);
 await act(async()=>{AppState.currentState='active';listener('active')});expect(load).toHaveBeenCalledTimes(2);
 await act(async()=>screen.unmount());screen=null;expect(remove).toHaveBeenCalledTimes(1);const calls=load.mock.calls.length;await act(async()=>jest.advanceTimersByTime(90000));expect(load).toHaveBeenCalledTimes(calls);
});
test('a slow read never overlaps with another automatic poll',async()=>{
 let resolve;const load=jest.fn(()=>new Promise(r=>{resolve=r}));await act(async()=>{screen=Renderer.create(<Harness load={load}/>)});
 await act(async()=>jest.advanceTimersByTime(90000));expect(load).toHaveBeenCalledTimes(1);await act(async()=>resolve());
 await act(async()=>jest.advanceTimersByTime(30000));expect(load).toHaveBeenCalledTimes(2);
});
