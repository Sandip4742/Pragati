"use client";
import { useEffect, useState, useRef } from "react";
import { useHistoryOverlay } from "./use-history-overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
export function JoinMemory() {
  useEffect(() => {
    const join = new URLSearchParams(location.search).get("join");
    if (join) sessionStorage.setItem("schoolconnect-join", join);
  }, []);
  return null;
}
export function AddChild({
  directory,
  autoPrompt = false,
  onConnected,
}: {
  directory: any[];
  autoPrompt?: boolean;
  phone?: string;
  onConnected: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false),
    [school, setSchool] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [dob, setDob] = useState(""),
    [relationship, setRelationship] = useState("");
  useEffect(() => {
    const join =
      new URLSearchParams(location.search).get("join") ||
      sessionStorage.getItem("schoolconnect-join");
    setSchool((current) =>
      directory.some((s) => s.id === current)
        ? current
        : join && directory.some((s) => s.id === join)
          ? join
          : "",
    );
  }, [directory]);
  const onboardingRequest = useRef<Promise<any> | null>(null);
  useEffect(() => {
    if (!autoPrompt) return;
    let live = true;
    // Share the request across effect replays; the server records it per account.
    onboardingRequest.current ||= fetch("/api/parent/onboarding", { method: "POST" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Unable to check onboarding.");
        return r.json();
      });
    onboardingRequest.current.then((result) => {
      if (live && result.shouldOpen) setOpen(true);
    }).catch(() => { /* Manual Connect Child remains available. */ });
    return () => { live = false; };
  }, [autoPrompt]);
  useHistoryOverlay(open, () => setOpen(false));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!directory.some((s) => s.id === school)) {
      setError("Please choose a matching school.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/school", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connectEmail",
          role: "parent",
          schoolId: school,
          payload: { dob, relationship },
        }),
      });
      const d: any = await r.json();
      if (!r.ok) throw new Error(d.error || "Unable to verify. Try again.");
      sessionStorage.removeItem("schoolconnect-join");
      const url = new URL(location.href);
      url.searchParams.delete("join");
      history.replaceState(history.state, "", url.pathname + url.search);
      setSuccess(
        d.count > 1
          ? `${d.count} children verified and connected.`
          : "Child verified and connected.",
      );
      setOpen(false);
      setDob("");
      await onConnected();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          setError("");
          setSuccess("");
        }}
      >
        + Connect Child
      </Button>
      {success && <p role="status">{success}</p>}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="form-dialog">
          <DialogHeader>
            <DialogTitle>Connect your child</DialogTitle>
            <DialogDescription>
              Use the Google account email registered with your school. No child
              details are shown until verification succeeds.
            </DialogDescription>
          </DialogHeader>
          {directory.length === 0 && (
            <p role="status">
              Your email ID does not match our school records. Please contact the school.
            </p>
          )}
          <form onSubmit={submit} className="guardian-form">
            <label>
              School
              <Select
                value={school}
                disabled={busy || directory.length === 0}
                onValueChange={(v) => {
                  setSchool(v);
                  setError("");
                }}
              >
                <SelectTrigger aria-label="School">
                  <SelectValue placeholder="Choose your school" />
                </SelectTrigger>
                <SelectContent>
                  {directory.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              Date of birth
              <Input
                required
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </label>
            <label>
              Relationship
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger aria-label="Relationship">
                  <SelectValue placeholder="Choose relationship" />
                </SelectTrigger>
                <SelectContent>
                  {["Mother", "Father", "Guardian"].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {error && (
              <p role="alert" className="error-banner">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || !directory.some((s) => s.id === school) || !dob || !relationship}>
              {busy ? "Verifying…" : "Verify & connect"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
