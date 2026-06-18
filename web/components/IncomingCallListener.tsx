"use client";
import { useEffect, useRef, useState } from "react";
import { getUser } from "@/lib/api";
import CallOverlay from "@/app/(app)/inbox/components/CallOverlay";

// IncomingCallListener rings the agent for user-initiated WhatsApp calls,
// anywhere in the app. It reacts to the app-wide WebSocket (Shell re-dispatches
// each frame as a window "ws_message" CustomEvent) and shows the inbound call
// overlay when a call is routed to this agent (or is unassigned).

interface IncomingCall {
  callId: string;
  conversationId: string;
  contactName: string | null;
  contactPhone: string | null;
  sdpOffer: string | null;
}

export default function IncomingCallListener() {
  const [call, setCall] = useState<IncomingCall | null>(null);
  const ringRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => { userIdRef.current = getUser()?.id ?? null; }, []);

  const stopRing = () => {
    if (ringRef.current) { clearInterval(ringRef.current); ringRef.current = null; }
  };
  const startRing = () => {
    stopRing();
    const beep = () => {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 520; o.type = "sine";
        g.gain.setValueAtTime(0.25, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        o.start(); o.stop(ctx.currentTime + 0.5);
        setTimeout(() => ctx.close(), 700);
      } catch { /* audio may be blocked until user gesture */ }
    };
    beep();
    ringRef.current = setInterval(beep, 2500);
  };

  useEffect(() => {
    const onWS = (e: Event) => {
      const ev = (e as CustomEvent).detail;
      if (!ev || ev.type !== "call.updated") return;
      const p = ev.data || ev;

      if (p.call_status === "incoming" && p.direction === "inbound") {
        const me = userIdRef.current;
        // Assigned to a specific agent → only ring that agent. Unassigned → ring all.
        if (p.agent_id && me && p.agent_id !== me) return;
        setCall({
          callId: p.call_id,
          conversationId: p.conversation_id,
          contactName: p.contact_name ?? null,
          contactPhone: p.contact_phone ?? null,
          sdpOffer: p.sdp_offer ?? null,
        });
        startRing();
        return;
      }
      // Any other state for the live call (connected/ended/failed) → stop ringing.
      if (p.call_status && p.call_status !== "incoming") stopRing();
    };
    window.addEventListener("ws_message", onWS);
    return () => { window.removeEventListener("ws_message", onWS); stopRing(); };
  }, []);

  if (!call) return null;

  return (
    <CallOverlay
      callId={call.callId}
      conversationId={call.conversationId}
      contactName={call.contactName}
      contactPhone={call.contactPhone}
      sdpOffer={call.sdpOffer}
      direction="inbound"
      onClose={() => { stopRing(); setCall(null); }}
      notify={(msg, sev) => { if (sev === "error") console.error("[call]", msg); }}
    />
  );
}
