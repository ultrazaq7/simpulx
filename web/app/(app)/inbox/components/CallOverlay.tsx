"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Phone, PhoneDisconnect as PhoneOff, PhoneIncoming, Microphone as Mic, MicrophoneSlash as MicOff, X, CircleNotch as Loader2, Minus, DotsSix as GripHorizontal, CaretUp as ChevronUp } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

// ── Call States ──
// OUTBOUND (agent calls customer): requesting → granted → ringing → connected → ended
// INBOUND  (customer calls business → rings assigned agent): incoming → connecting → connected → ended
// Events arrive over the app-wide WebSocket (Shell dispatches a window "ws_message"
// CustomEvent), so this overlay does not open its own socket.
//
// UI: a draggable, minimizable floating "call" widget (Qontak-style).

interface CallOverlayProps {
  callId: string;
  conversationId: string;
  contactName: string | null;
  contactPhone: string | null;
  onClose: () => void;
  notify: (msg: string, severity?: "success" | "info" | "warning" | "error") => void;
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
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
function initials(name?: string | null) {
  if (!name) return "?";
  const p = name.trim().split(/\s+/);
  return (((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase()) || "?";
}
function waitForIce(pc: RTCPeerConnection): Promise<void> {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") { resolve(); return; }
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === "complete") resolve(); };
    setTimeout(resolve, 2000);
  });
}
function pickRecMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
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

  // ── Floating widget: position / minimize / mic devices ──
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [placed, setPlaced] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const dragOff = useRef<{ dx: number; dy: number } | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Call recording: mix local mic + remote audio, record, offer a download ──
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const mixCtxRef = useRef<AudioContext | null>(null);
  const recBlobRef = useRef<Blob | null>(null);
  const uploadedRef = useRef(false);
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const stopRecording = useCallback(() => {
    setRecording(false);
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { /* ignore */ } }
  }, []);

  const startRecording = useCallback(() => {
    if (recorderRef.current || typeof MediaRecorder === "undefined") return;
    const local = streamRef.current, remote = remoteStreamRef.current;
    if (!local || !remote) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx(); mixCtxRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();
      // Mix both sides into one stream; route only to the recorder (not speakers) so
      // there is no echo. The remote side is heard via its own <audio> element.
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(local).connect(dest);
      ctx.createMediaStreamSource(remote).connect(dest);
      const mime = pickRecMime();
      const rec = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined);
      recChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(recChunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) { recBlobRef.current = blob; setRecUrl(URL.createObjectURL(blob)); }
        if (mixCtxRef.current) { mixCtxRef.current.close().catch(() => {}); mixCtxRef.current = null; }
      };
      rec.start(1000);
      recorderRef.current = rec;
      setRecording(true);
    } catch { /* recording unsupported -> skip silently */ }
  }, []);

  useEffect(() => {
    setPos({ x: window.innerWidth - 320 - 24, y: window.innerHeight - 440 });
    setPlaced(true);
  }, []);

  const cleanup = useCallback(() => {
    stopRecording();
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    remoteStreamRef.current = null;
  }, [stopRecording]);
  useEffect(() => () => cleanup(), [cleanup]);
  useEffect(() => () => { if (recUrl) URL.revokeObjectURL(recUrl); }, [recUrl]);

  // Persist the recording to storage so it shows in Call Logs (download later).
  useEffect(() => {
    if (!recUrl || uploadedRef.current || !recBlobRef.current) return;
    uploadedRef.current = true;
    const blob = recBlobRef.current;
    const ext = blob.type.includes("ogg") ? "ogg" : "webm";
    const file = new File([blob], `call-${callId}.${ext}`, { type: blob.type || "audio/webm" });
    api.uploadFile(file)
      .then((res) => { if (res?.url) return api.saveCallRecording(callId, res.url); })
      .catch(() => { /* best effort: a failed upload just means no Call Logs entry */ });
  }, [recUrl, callId]);

  // Outbound: ICE connects at RING time (WhatsApp pre-establishes media), so
  // "connected" must wait for real inbound audio bytes = actual pickup. That
  // also tells the backend when talk time starts (accurate durations).
  const pickupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startPickupDetect = useCallback((pc: RTCPeerConnection) => {
    if (pickupPollRef.current) return;
    pickupPollRef.current = setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let bytes = 0;
        stats.forEach((s: any) => {
          if (s.type === "inbound-rtp" && (s.kind === "audio" || s.mediaType === "audio")) bytes += s.bytesReceived || 0;
        });
        if (bytes > 500) {
          if (pickupPollRef.current) { clearInterval(pickupPollRef.current); pickupPollRef.current = null; }
          setCallStatus("connected");
          api.callConnected(callId).catch(() => {});
        }
      } catch { /* keep polling */ }
    }, 500);
  }, [callId]);
  useEffect(() => () => { if (pickupPollRef.current) clearInterval(pickupPollRef.current); }, []);

  const wirePeer = useCallback((pc: RTCPeerConnection) => {
    pc.ontrack = (event) => {
      remoteStreamRef.current = event.streams[0];
      const a = new Audio(); a.srcObject = event.streams[0]; a.play().catch(() => {});
      startRecording();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        if (inbound) setCallStatus("connected");
        else startPickupDetect(pc);
      }
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setCallStatus("ended"); setEndReason("Connection lost"); cleanup();
      }
    };
  }, [cleanup, startRecording, inbound, startPickupDetect]);

  useEffect(() => {
    const onWS = (e: Event) => {
      const ev = (e as CustomEvent).detail;
      if (!ev || ev.type !== "call.updated") return;
      const payload = ev.data || ev;
      if (payload.call_id !== callId) return;
      if (payload.permission_status) setPermStatus(payload.permission_status);
      if (payload.call_status) setCallStatus(payload.call_status);
      if (payload.end_reason) setEndReason(payload.end_reason);
      if (payload.permission_status === "granted" && payload.call_status === "idle") setCallStatus("granted");
      if (payload.permission_status === "denied") { setCallStatus("ended"); setEndReason("Customer declined the call request"); }
      if (payload.sdp_answer && pcRef.current) {
        pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: payload.sdp_answer }))
          .catch((err) => console.error("setRemoteDescription failed:", err));
      }
      if (payload.call_status === "ended") { cleanup(); if (payload.duration_seconds) setElapsed(payload.duration_seconds); }
    };
    window.addEventListener("ws_message", onWS);
    return () => window.removeEventListener("ws_message", onWS);
  }, [callId, cleanup]);

  useEffect(() => {
    if (callStatus === "connected") timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callStatus]);

  const initiateCall = async () => {
    try {
      setCallStatus("ringing");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const pc = new RTCPeerConnection(ICE_SERVERS); pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream)); wirePeer(pc);
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer); await waitForIce(pc);
      const sdp = pc.localDescription?.sdp; if (!sdp) throw new Error("Failed to generate SDP offer");
      await api.initiateCall(callId, sdp);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Call failed";
      notify(msg, "error"); setCallStatus("ended"); setEndReason(msg); cleanup();
    }
  };

  const acceptCall = async () => {
    if (!sdpOffer) { notify("Missing call offer", "error"); return; }
    try {
      setCallStatus("connecting");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const pc = new RTCPeerConnection(ICE_SERVERS); pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream)); wirePeer(pc);
      await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: sdpOffer }));
      const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); await waitForIce(pc);
      const sdp = pc.localDescription?.sdp; if (!sdp) throw new Error("Failed to generate SDP answer");
      await api.acceptCall(callId, sdp);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to answer";
      notify(msg, "error"); setCallStatus("ended"); setEndReason(msg); cleanup();
    }
  };

  const rejectCall = async () => {
    try { await api.rejectCall(callId); } catch { /* best effort */ }
    cleanup(); setCallStatus("ended"); setEndReason("declined");
  };
  const endCall = async () => {
    try { await api.endCall(callId); } catch { /* best effort */ }
    cleanup(); setCallStatus("ended"); setEndReason("agent_hangup");
  };
  const toggleMute = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
      setMuted((m) => !m);
    }
  };
  const openDevices = async () => {
    try { const ds = await navigator.mediaDevices.enumerateDevices(); setDevices(ds.filter((d) => d.kind === "audioinput")); } catch { /* ignore */ }
    setShowDevices((v) => !v);
  };
  const pickDevice = async (id: string) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: id } } });
      const nt = s.getAudioTracks()[0];
      const sender = pcRef.current?.getSenders().find((x) => x.track?.kind === "audio");
      if (sender) await sender.replaceTrack(nt);
      streamRef.current?.getAudioTracks().forEach((t) => t.stop());
      streamRef.current = s; nt.enabled = !muted;
    } catch { notify("Could not switch microphone", "error"); }
    setShowDevices(false);
  };

  const startDrag = (e: React.PointerEvent) => {
    dragOff.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    const w = minimized ? 240 : 320;
    const move = (ev: PointerEvent) => {
      if (!dragOff.current) return;
      setPos({
        x: clamp(ev.clientX - dragOff.current.dx, 8, window.innerWidth - w - 8),
        y: clamp(ev.clientY - dragOff.current.dy, 8, window.innerHeight - 80),
      });
    };
    const up = () => { dragOff.current = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const isActive = callStatus === "ringing" || callStatus === "connecting" || callStatus === "connected";
  const isEnded = callStatus === "ended" || callStatus === "failed";
  const statusLabel =
    callStatus === "requesting" ? "Requesting permission" :
    callStatus === "granted" ? "Permission granted" :
    callStatus === "incoming" ? "Incoming call" :
    callStatus === "ringing" ? "Ringing" :
    callStatus === "connecting" ? "Connecting" :
    callStatus === "connected" ? "On call" :
    isEnded ? "Call ended" : "";
  const dotColor =
    callStatus === "connected" ? "bg-emerald-400" :
    callStatus === "incoming" ? "bg-emerald-400" :
    callStatus === "ringing" || callStatus === "connecting" ? "bg-amber-400" :
    isEnded ? "bg-red-500" : "bg-slate-400";

  const wrap = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-[120] pointer-events-none" aria-hidden={!placed}>
      <div
        className={cn("absolute pointer-events-auto select-none transition-opacity", placed ? "opacity-100" : "opacity-0")}
        style={{ left: pos.x, top: pos.y, width: minimized ? 240 : 320 }}
      >
        {children}
      </div>
    </div>
  );

  // ── Minimized pill ──
  if (minimized) {
    return wrap(
      <div className="rounded-full bg-[#23272F] border border-white/10 shadow-2xl flex items-center gap-2 pl-2 pr-1.5 py-1.5">
        <div onPointerDown={startDrag} className="cursor-grab active:cursor-grabbing p-1 text-white/30"><GripHorizontal className="w-4 h-4" /></div>
        <div className="w-8 h-8 rounded-full bg-emerald-500 grid place-items-center text-white text-[11px] font-bold shrink-0">{initials(contactName)}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-white truncate leading-tight">{contactName || "Unknown"}</p>
          <p className="text-[10.5px] text-emerald-400 tabular-nums leading-tight">{callStatus === "connected" ? fmt(elapsed) : statusLabel}</p>
        </div>
        <button onClick={() => setMinimized(false)} className="w-7 h-7 grid place-items-center rounded-full text-white/60 hover:bg-white/10 outline-none"><ChevronUp className="w-4 h-4" /></button>
        {(isActive || callStatus === "incoming") && (
          <button onClick={callStatus === "incoming" ? rejectCall : endCall} className="w-7 h-7 grid place-items-center rounded-full bg-red-600 hover:bg-red-700 text-white outline-none"><PhoneOff className="w-3.5 h-3.5" /></button>
        )}
      </div>
    );
  }

  // ── Full panel ──
  return wrap(
    <div className="rounded-2xl bg-[#23272F] border border-white/10 shadow-2xl overflow-hidden animate-scale-in">
      {/* Title bar (drag handle) */}
      <div onPointerDown={startDrag} className="relative flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
          <span className={cn("w-2 h-2 rounded-full", dotColor, !isEnded && "animate-pulse")} />
          <span className={cn(callStatus === "connected" || callStatus === "incoming" ? "text-emerald-400" : "text-white/60")}>{statusLabel}</span>
          {recording && <span className="flex items-center gap-1 text-[10px] font-bold text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />REC</span>}
        </span>
        <span className="absolute left-1/2 -translate-x-1/2 text-white/20"><GripHorizontal className="w-4 h-4" /></span>
        <span className="flex items-center gap-0.5">
          <button onClick={() => setMinimized(true)} className="w-6 h-6 grid place-items-center rounded text-white/50 hover:bg-white/10 outline-none"><Minus className="w-4 h-4" /></button>
          {isEnded && <button onClick={onClose} className="w-6 h-6 grid place-items-center rounded text-white/50 hover:bg-white/10 outline-none"><X className="w-4 h-4" /></button>}
        </span>
      </div>

      {/* Timer */}
      {callStatus === "connected" && (
        <div className="px-4 flex items-center gap-2 text-emerald-400">
          <Phone className="w-4 h-4" />
          <span className="text-2xl font-bold text-white tabular-nums tracking-tight">{fmt(elapsed)}</span>
        </div>
      )}

      {/* Contact card */}
      <div className="px-4 pt-3 pb-2">
        <div className="rounded-xl bg-gradient-to-b from-[#3A4150] to-[#2C313B] p-4 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500 grid place-items-center text-white text-xl font-bold mb-2 shadow-lg">
            {inbound && callStatus === "incoming" ? <PhoneIncoming className="w-7 h-7" /> : initials(contactName)}
          </div>
          <p className="text-[15px] font-bold text-white truncate max-w-full">{contactName || "Unknown"}</p>
          {contactPhone && <p className="text-[12px] text-white/55 tabular-nums">{contactPhone}</p>}
          {callStatus === "incoming" && <p className="text-[11px] text-emerald-400 mt-1 animate-pulse">is calling you…</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-5 pt-2 flex items-center justify-center gap-5 relative">
        {callStatus === "requesting" && (
          <div className="flex flex-col items-center gap-2 py-1">
            <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
            <p className="text-[11px] text-white/50">Waiting for customer to allow…</p>
          </div>
        )}

        {callStatus === "granted" && (
          <button onClick={initiateCall} className="flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-lg outline-none">
            <Phone className="w-5 h-5" />Call now
          </button>
        )}

        {callStatus === "incoming" && (
          <>
            <button onClick={rejectCall} className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 grid place-items-center text-white shadow-lg outline-none"><PhoneOff className="w-6 h-6" /></button>
            <button onClick={acceptCall} className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 grid place-items-center text-white shadow-lg outline-none animate-pulse"><Phone className="w-6 h-6" /></button>
          </>
        )}

        {(callStatus === "ringing" || callStatus === "connecting") && (
          <button onClick={endCall} className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 grid place-items-center text-white shadow-lg outline-none"><PhoneOff className="w-6 h-6" /></button>
        )}

        {callStatus === "connected" && (
          <>
            <div className="relative">
              <button onClick={toggleMute} className={cn("w-14 h-14 rounded-full grid place-items-center text-white shadow-lg outline-none", muted ? "bg-amber-600 hover:bg-amber-700" : "bg-white/10 hover:bg-white/20")}>
                {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              <button onClick={openDevices} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#23272F] border border-white/20 grid place-items-center text-white/70 hover:text-white outline-none"><ChevronUp className="w-3 h-3" /></button>
              {showDevices && (
                <div className="absolute bottom-16 left-0 w-56 max-h-44 overflow-y-auto bg-[#2C313B] border border-white/10 rounded-lg shadow-xl p-1 z-10">
                  <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-white/40">Microphone</p>
                  {devices.length === 0 ? <p className="px-2 py-1.5 text-[12px] text-white/50">No devices</p> :
                    devices.map((d) => (
                      <button key={d.deviceId} onClick={() => pickDevice(d.deviceId)} className="w-full text-left px-2 py-1.5 rounded text-[12px] text-white/80 hover:bg-white/10 truncate outline-none">
                        {d.label || "Microphone"}
                      </button>
                    ))}
                </div>
              )}
            </div>
            <button onClick={endCall} className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 grid place-items-center text-white shadow-lg outline-none"><PhoneOff className="w-6 h-6" /></button>
          </>
        )}

        {isEnded && (
          <div className="flex flex-col items-center gap-1 py-1">
            {elapsed > 0 && <span className="text-lg font-bold text-white tabular-nums">{fmt(elapsed)}</span>}
            <p className="text-[11.5px] text-white/55">
              {endReason === "agent_hangup" ? "You ended the call" :
               endReason === "remote_hangup" ? "Customer ended the call" :
               endReason === "permission_denied" ? "Customer declined" :
               endReason === "rejected" || endReason === "declined" ? "Call declined" :
               endReason || "Call ended"}
            </p>
            {recUrl && <p className="mt-1 text-[11px] text-emerald-400/80">Recording saved to Call Logs</p>}
            <button onClick={onClose} className="mt-2 px-4 py-1.5 rounded-md text-[12px] font-semibold text-emerald-400 hover:bg-white/10 outline-none">Dismiss</button>
          </div>
        )}
      </div>
    </div>
  );
}
