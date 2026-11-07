import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/** One request at a time, only for the visible screen while the app is active. */
export default function useFocusedRefresh(refresh: () => Promise<any>, intervalMs = 30000) {
    useFocusEffect(useCallback(() => {
        let timer: ReturnType<typeof setInterval> | undefined;
        let stopped = false, inFlight = false;
        const load = async () => {
            if (stopped || inFlight || (AppState.currentState && AppState.currentState !== 'active')) return;
            inFlight = true;
            try { await refresh(); } catch {} finally { inFlight = false; }
        };
        const pause = () => { if (timer) clearInterval(timer); timer = undefined; };
        const resume = () => { pause(); load(); if (intervalMs > 0) timer = setInterval(load, intervalMs); };
        if (!AppState.currentState || AppState.currentState === 'active') resume();
        const listener = AppState.addEventListener('change', state => state === 'active' ? resume() : pause());
        return () => { stopped = true; pause(); listener.remove(); };
    }, [refresh, intervalMs]));
}
