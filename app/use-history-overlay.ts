'use client';
import {useEffect,useRef} from 'react';
// An overlay occupies one browser-history entry so mobile Back closes it first.
export function useHistoryOverlay(active:boolean,onBack:()=>void){
 const close=useRef(onBack);close.current=onBack;
 useEffect(()=>{if(!active)return;const marker=crypto.randomUUID();history.pushState({...history.state,schoolOverlay:marker},'');const pop=()=>{if(history.state?.schoolOverlay!==marker)close.current()};window.addEventListener('popstate',pop);return()=>{window.removeEventListener('popstate',pop);if(history.state?.schoolOverlay===marker)history.back()};},[active]);
}
