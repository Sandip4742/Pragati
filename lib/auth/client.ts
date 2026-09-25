"use client";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence, browserSessionPersistence, type User } from "firebase/auth";
import { firebaseConfig } from "./config";
export function browserAuth() {
  return getAuth(getApps().length ? getApp() : initializeApp(firebaseConfig));
}
const REMEMBER='schoolconnect-remember';
const TAB='schoolconnect-session';
export let authInteraction=false;
export function beginAuthInteraction(){authInteraction=true;}
export function endAuthInteraction(){authInteraction=false;}
export function canRestoreSession(){try{return localStorage.getItem(REMEMBER)==='true'||sessionStorage.getItem(TAB)==='true';}catch{return false;}}
export function remembersSession(){try{return localStorage.getItem(REMEMBER)==='true';}catch{return false;}}
export function rememberSession(keep:boolean){localStorage.removeItem(REMEMBER);sessionStorage.removeItem(TAB);if(keep)localStorage.setItem(REMEMBER,'true');else sessionStorage.setItem(TAB,'true');}
export function forgetSession(){try{localStorage.removeItem(REMEMBER);sessionStorage.removeItem(TAB);}catch{/* Storage may be disabled. */}}
export function configurePersistence(keep:boolean){return setPersistence(browserAuth(),keep?browserLocalPersistence:browserSessionPersistence);}
let sessionRequest:Promise<Response>|undefined;
export function exchangeSession(body:Record<string,unknown>){
  sessionRequest=fetch('/api/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  return sessionRequest;
}
export async function finishPendingSession(){try{await sessionRequest;}catch{/* Sign-out must still clear the cookie after a failed renewal. */}}
export async function saveSession(
  user: User,
  linkExisting = false,
  portal?: string,
) {
  const idToken = await user.getIdToken(true);
  const response = await exchangeSession({ idToken, linkExisting, portal });
  const result: any = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to sign in.");
}
export function authMessage(error: any) {
  const messages: Record<string, string> = {
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "auth/popup-closed-by-user":
      "The Google window was closed. Please try again.",
    "auth/popup-blocked":
      "Allow pop-ups for this website, then try Google sign-in again.",
    "auth/unauthorized-domain":
      "This website domain has not been authorized in Firebase. Contact the School Admin.",
    "auth/operation-not-allowed":
      "This sign-in method is not enabled yet. Contact the School Admin.",
    "auth/account-exists-with-different-credential":
      "Sign in using your existing method first, then connect Google from Account settings.",
    "auth/credential-already-in-use":
      "This Google account is already connected to another account.",
    "auth/provider-already-linked":
      "Google is already connected to your account.",
    "auth/requires-recent-login":
      "Please sign out and sign in again before changing your account.",
    "auth/network-request-failed":
      "Could not connect. Check your internet connection and try again.",
    "auth/user-disabled":
      "This account has been disabled. Contact the School Admin.",
  };
  return (
    messages[error?.code] ||
    (error?.code
      ? "Unable to complete sign-in. Please try again."
      : error?.message || "Unable to complete sign-in.")
  );
}
