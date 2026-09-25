"use client";
import { useEffect, useState } from "react";
import { RoleChoice, rememberRole } from "./role-choice";
import { portalRole, ROLE_COOKIE } from "@/lib/auth/roles";
import { BookOpen, LogOut, ArrowLeft, Loader2 } from "lucide-react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onIdTokenChanged,
  type User,
} from "firebase/auth";
import { browserAuth, saveSession, authMessage, configurePersistence, rememberSession, remembersSession, canRestoreSession, forgetSession, authInteraction, beginAuthInteraction, endAuthInteraction } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from '@/components/ui/checkbox';
import { exchangeSession, finishPendingSession } from '@/lib/auth/client';

export function AuthBridge({
  provider,
  firebaseUid,
}: {
  provider?: string;
  firebaseUid?: string;
}) {
  const [error, setError] = useState("");
  const [restoring,setRestoring]=useState(false);
  useEffect(() => {
    if (provider === "chatgpt") return;
    let live = true;
    let pending=false,lastRenewed=0;
    async function renew(user:User|null,force=false){
      if (
        authInteraction || pending || !user || (firebaseUid && user.uid !== firebaseUid) ||
        (!provider&&!canRestoreSession()) ||
        user.providerData.every((x) => x.providerId !== "google.com")
      )
        return;
      if(force&&Date.now()-lastRenewed<60000)return;
      pending=true;
      if(!provider&&live)setRestoring(true);
      try {
        const token = await user.getIdToken(force);
        if(!live||authInteraction)return;
        const r = await exchangeSession({ idToken: token, portal: portalRole(document.cookie.split("; ").find((x) => x.startsWith(ROLE_COOKIE + "="))?.split("=")[1]) });
        if (!r.ok){const body=await r.json() as {error?:string};throw new Error(body.error||'Your session could not be restored. Please sign in again.');}
        lastRenewed=Date.now();
        if(live&&!authInteraction){setError('');if(!provider)window.location.replace(window.location.pathname+window.location.search);}
      } catch (e: any) {
        if (live) setError(e.message || "Please sign in again.");
      }finally{pending=false;if(live)setRestoring(false);}
    }
    const unsubscribe = onIdTokenChanged(browserAuth(),user=>{void renew(user);});
    const resume=()=>{if(document.visibilityState==='visible')void renew(browserAuth().currentUser,true);};
    window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
    const timer=window.setInterval(resume,10*60*1000);
    return () => {
      live = false;
      unsubscribe();
      clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);
    };
  }, [provider, firebaseUid]);
  return restoring ? <div role="status" className="session-restoring"><Loader2 className="animate-spin"/>Restoring your session…</div> : error ? (
    <div className="error-banner" role="alert">
      {error}
      <SignOutButton />
    </div>
  ) : null;
}

export function SignOutButton({ icon = false }: { icon?: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className={icon ? "auth-signout-icon" : "text-link"}
        disabled={busy}
        aria-label="Sign out"
        title="Sign out"
        onClick={async () => {
          setBusy(true);
          beginAuthInteraction();
          forgetSession();
          try {
            await signOut(browserAuth());
            await finishPendingSession();
            const r = await fetch("/api/auth/session", { method: "DELETE" });
            if (!r.ok) throw new Error("Could not sign out. Try again.");
            window.location.assign("/");
          } catch (e: any) {
            endAuthInteraction();
            setError(e.message);
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <Loader2 className="animate-spin" size={17} />
        ) : icon ? (
          <LogOut size={17} />
        ) : (
          "Sign out"
        )}
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}

export function AuthPanel({
  linkEmail,
  initialRole = "admin",
}: {
  linkEmail?: string;
  initialRole?: string;
}) {
  const [selectedRole, setSelectedRole] = useState(portalRole(initialRole)),
    [keepSignedIn,setKeepSignedIn]=useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setKeepSignedIn(remembersSession());
    const saved = document.cookie
      .split("; ")
      .find((x) => x.startsWith(ROLE_COOKIE + "="))
      ?.split("=")[1];
    if (
      new URLSearchParams(location.search).has("join") ||
      sessionStorage.getItem("schoolconnect-join")
    ) {
      setSelectedRole("parent");
      rememberRole("parent");
    } else if (saved) setSelectedRole(portalRole(saved));
  }, []);
  async function finish(user: User) {
    rememberRole(selectedRole);
    await saveSession(user, !!linkEmail, selectedRole);
    rememberSession(keepSignedIn);
    window.location.replace("/");
  }
  async function google() {
    if (busy) return;
    setBusy(true);
    beginAuthInteraction();
    forgetSession();
    setError("");
    try {
      await configurePersistence(keepSignedIn);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
        ...(linkEmail ? { login_hint: linkEmail } : {}),
      });
      const result = await signInWithPopup(browserAuth(), provider);
      await finish(result.user);
    } catch (e) {
      endAuthInteraction();
      setError(authMessage(e));
      setBusy(false);
    }
  }
  return (
    <main className="signin-screen">
      <section className="signin-card auth-card">
        <span className="brand-icon">
          <BookOpen />
        </span>
        <h1>Welcome to SchoolConnect</h1>
        <p>Sign in to your school workspace.</p>
        <RoleChoice
          value={selectedRole}
          disabled={busy}
          onChange={(value) => {
            setSelectedRole(value);
            rememberRole(value);
            setError("");
          }}
        />
        {selectedRole === "platform" && (
          <p className="form-hint">
            Platform access is restricted to authorized accounts.
          </p>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <label className="keep-signed-in"><Checkbox checked={keepSignedIn} disabled={busy} onCheckedChange={v=>setKeepSignedIn(v===true)}/> <span>Keep Me Signed In</span></label>
        <small>Use this option only on your own device.</small>
        <Button className="google-signin" disabled={busy} onClick={google}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : null}Continue
          with Google
        </Button>
        {linkEmail && (
          <a className="text-link" href="/">
            <ArrowLeft size={15} />
            Back to workspace
          </a>
        )}
        <small>
          Google sign-in identifies you. Access is granted only from verified
          school assignments.
        </small>
      </section>
    </main>
  );
}

export function ConnectedAccount({
  email,
  phone,
}: {
  email: string;
  phone?: string;
  parentOnly?: boolean;
}) {
  return (
    <main className="signin-screen">
      <section className="signin-card auth-card">
        <span className="brand-icon">
          <BookOpen />
        </span>
        <h1>Account settings</h1>
        <p>{email || phone}</p>
        <div className="auth-form">
          <a className="text-link" href="/">
            Back to workspace
          </a>
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
