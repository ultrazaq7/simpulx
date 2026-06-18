"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

// ── Call States ──
// OUTBOUND (agent calls customer):
//   requesting → granted → ringing → connected → ended
// INBOUND (customer calls business → rings assigned agent):
//   incoming → connecting → connected → ended
//
// Call events arrive over the app-wide WebSocket (Shell dispatches a window
// "ws_message" CustomEvent for every frame), so this overlay does not open its
// own socket.

interface CallOverlayProps {
  callId: string;
  conversationId: string;
  contactName: string | null;
  contactPhone: string | null;
  onClose: () => void;
  notify: (msg: string, severity?: "success" | "info" | "warning" | "error") => void;
  // Inbound calls start ringing with the customer's SDP offer already in hand.
  direction?: "outbound" | "inbound";
  sdpOffer?: string | null;
  initialStatus?: string;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// Wait for ICE gathering to finish (or bail after 2s) so the SDP carries candidates.
function waitForIce(pc: RTCPeerConnection): Promise<void> {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") { resolve(); return; }
    const check = () => { if (pc.iceGatheringState === "complete") resolve(); };
    pc.onicegatheringstatechange = check;
    setTimeout(resolve, 2000);
  });
}

export default function CallOverlay({
  callId, conversationId, contactName, contactPhone, onClose, notify,
  direction = "outbound", sdpOffer = null, initialStatus,
}: CallOverlayProps) {
  const inbound = direction === "inbound";
  const [permStatus, setPermStatus] = useState<string>(inbound ? "granted" : "pending");
  const [callStatus, setCallStatus] = useState<string>(initialStatus || (inbound ? "incoming" : "requesting"));
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [endReason, setEndReason] = useState("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Cleanup ──
  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);
  useEffect(() => () => cleanup(), [cleanup]);

  // ── Wire a peer connection's common handlers (remote audio + state) ──
  const wirePeer = useCallback((pc: RTCPeerConnection) => {
    pc.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setCallStatus("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setCallStatus("ended");
        setEndReason("Connection lost");
        cleanup();
      }
    };
  }, [cleanup]);

  // ── App-wide WebSocket listener (Shell re-dispatches frames) ──
  useEffect(() => {
    const onWS = (e: Event) => {
      const ev = (e as CustomEvent).detail;
      if (!ev || ev.type !== "call.updated") return;
      const payload = ev.data || ev;
      if (payload.call_id !== callId) return;

      if (payload.permission_status) setPermStatus(payload.permission_status);
      if (payload.call_status) setCallStatus(payload.call_status);
      if (payload.end_reason) setEndReason(payload.end_reason);

      // Outbound: permission granted → ready to dial.
      if (payload.permission_status === "granted" && payload.call_status === "idle") {
        setCallStatus("granted");
      }
      if (payload.permission_status === "denied") {
        setCallStatus("ended");
        setEndReason("Customer declined the call request");
      }
      // Outbound: SDP answer received → finish the handshake.
      if (payload.sdp_answer && pcRef.current) {
        pcRef.current.setRemoteDescription(
          new RTCSessionDescription({ type: "answer", sdp: payload.sdp_answer })
        ).catch((err) => console.error("setRemoteDescription failed:", err));
      }
      if (payload.call_status === "ended") {
        cleanup();
        if (payload.duration_seconds) setElapsed(payload.duration_seconds);
      }
    };
    window.addEventListener("ws_message", onWS);
    return () => window.removeEventListener("ws_message", onWS);
  }, [callId, cleanup]);

  // ── Timer ──
  useEffect(() => {
    if (callStatus === "connected") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callStatus]);

  // ── Outbound: initiate (after permission granted) ──
  const initiateCall = async () => {
    try {
      setCallStatus("ringing");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      wirePeer(pc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc);

      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error("Failed to generate SDP offer");
      await api.initiateCall(callId, sdp);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Call failed";
      notify(msg, "error");
      setCallStatus("ended");
      setEndReason(msg);
      cleanup();
    }
  };

  // ── Inbound: accept (build answer from the customer's offer) ──
  const acceptCall = async () => {
    if (!sdpOffer) { notify("Missing call offer", "error"); return; }
    try {
      setCallStatus("connecting");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      wirePeer(pc);

      await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: sdpOffer }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIce(pc);

      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error("Failed to generate SDP answer");
      await api.acceptCall(callId, sdp);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to answer";
      notify(msg, "error");
      setCallStatus("ended");
      setEndReason(msg);
      cleanup();
    }
  };

  // ── Inbound: reject ──
  const rejectCall = async () => {
    try { await api.rejectCall(callId); } catch { /* best effort */ }
    cleanup();
    setCallStatus("ended");
    setEndReason("declined");
  };

  // ── End / hang up (both directions, once active) ──
  const endCall = async () => {
    try { await api.endCall(callId); } catch { /* best effort */ }
    cleanup();
    setCallStatus("ended");
    setEndReason("agent_hangup");
  };

  const toggleMute = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
      setMuted((m) => !m);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const isActive = callStatus === "ringing" || callStatus === "connecting" || callStatus === "connected";
  const isEnded = callStatus === "ended" || callStatus === "failed";

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-end p-6 pointer-events-none">
      <div
        className={cn(
          "pointer-events-auto w-[340px] rounded-2xl shadow-2xl border overflow-hidden animate-scale-in origin-bottom-right transition-all duration-300",
          isActive ? "bg-[#0B141A] border-[#2D8B73]/40" : "bg-card border-border",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2.5 h-2.5 rounded-full",
              callStatus === "connected" ? "bg-[#2D8B73] animate-pulse" :
              callStatus === "ringing" || callStatus === "connecting" ? "bg-amber-500 animate-pulse" :
              callStatus === "incoming" ? "bg-[#2D8B73] animate-pulse" :
              callStatus === "granted" ? "bg-primary" :
              isEnded ? "bg-red-500" : "bg-muted-foreground/40 animate-pulse",
            )} />
            <span className={cn(
              "text-xs font-bold uppercase tracking-wider",
              isActive ? "text-white/70" : "text-muted-foreground",
            )}>
              {callStatus === "requesting" && "Requesting permission..."}
              {callStatus === "granted" && "Permission granted"}
              {callStatus === "incoming" && "Incoming call"}
              {callStatus === "ringing" && "Ringing..."}
              {callStatus === "connecting" && "Connecting..."}
              {callStatus === "connected" && "On call"}
              {isEnded && "Call ended"}
            </span>
          </div>
          {isEnded && (
            <button onClick={onClose} className="p-1 rounded-full text-muted-foreground hover:bg-muted outline-none">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Timer (connected) */}
        {callStatus === "connected" && (
          <div className="px-4 pb-1">
            <span className="text-3xl font-bold text-white tabular-nums tracking-tight">
              {formatTime(elapsed)}
            </span>
          </div>
        )}

        {/* Contact info */}
        <div className="px-4 py-3">
          <div className={cn(
            "flex items-center gap-3 p-3 rounded-xl",
            isActive ? "bg-white/[0.08]" : "bg-muted",
          )}>
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0",
              isActive ? "bg-[#2D8B73]" : inbound && callStatus === "incoming" ? "bg-[#2D8B73]" : "bg-primary",
            )}>
              {inbound && callStatus === "incoming" ? <PhoneIncoming className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <p className={cn("text-sm font-bold truncate", isActive ? "text-white" : "text-foreground")}>
                {contactName || "Unknown"}
              </p>
              {contactPhone && (
                <p className={cn("text-xs tabular-nums", isActive ? "text-white/60" : "text-muted-foreground")}>
                  {contactPhone}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-5 flex items-center justify-center gap-4">
          {/* Outbound: requesting */}
          {callStatus === "requesting" && (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Waiting for customer...</p>
            </div>
          )}

          {/* Outbound: permission granted → Call Now */}
          {callStatus === "granted" && (
            <button onClick={initiateCall}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-[#2D8B73] hover:bg-[#24725F] text-white font-bold text-sm shadow-lg transition-all hover:shadow-xl outline-none">
              <Phone className="w-5 h-5" />Call Now
            </button>
          )}

          {/* Inbound: incoming → Reject / Accept */}
          {callStatus === "incoming" && (
            <>
              <button onClick={rejectCall}
                className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-lg transition-colors outline-none">
                <PhoneOff className="w-6 h-6" />
              </button>
              <button onClick={acceptCall}
                className="w-14 h-14 rounded-full bg-[#2D8B73] hover:bg-[#24725F] flex items-center justify-center text-white shadow-lg transition-colors outline-none animate-pulse">
                <Phone className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Ringing / connecting → spinner + cancel */}
          {(callStatus === "ringing" || callStatus === "connecting") && (
            <>
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-[#2D8B73]/20 flex items-center justify-center animate-pulse">
                  <Phone className="w-7 h-7 text-[#2D8B73]" />
                </div>
                <p className="text-xs text-white/50">Connecting...</p>
              </div>
              <button onClick={endCall}
                className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-lg transition-colors outline-none">
                <PhoneOff className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Connected → mute + end */}
          {callStatus === "connected" && (
            <>
              <button onClick={toggleMute}
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-all outline-none",
                  muted ? "bg-amber-600 hover:bg-amber-700" : "bg-white/10 hover:bg-white/20",
                )}>
                {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              <button onClick={endCall}
                className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-lg transition-colors outline-none">
                <PhoneOff className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Ended → summary */}
          {isEnded && (
            <div className="flex flex-col items-center gap-1 py-1">
              {elapsed > 0 && (
                <span className="text-lg font-bold text-foreground tabular-nums">{formatTime(elapsed)}</span>
              )}
              <p className="text-xs text-muted-foreground">
                {endReason === "agent_hangup" ? "You ended the call" :
                 endReason === "remote_hangup" ? "Customer ended the call" :
                 endReason === "permission_denied" ? "Customer declined" :
                 endReason === "rejected" || endReason === "declined" ? "Call declined" :
                 endReason || "Call ended"}
              </p>
              <button onClick={onClose}
                className="mt-2 px-4 py-1.5 rounded-md text-xs font-semibold text-primary hover:bg-primary/10 transition-colors outline-none">
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
