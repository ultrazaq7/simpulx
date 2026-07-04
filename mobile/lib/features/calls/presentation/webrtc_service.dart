import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Thin WebRTC wrapper for 1:1 audio calls. Uses non-trickle ICE (gather, then
/// hand the full local SDP to the signaling layer) which matches the WhatsApp
/// Business Calling API's offer/answer exchange.
class WebRtcService {
  RTCPeerConnection? _pc;
  MediaStream? _localStream;

  static const _config = <String, dynamic>{
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      // TURN relays for prod NAT traversal are supplied by Meta within the
      // WhatsApp SDP; add an org TURN here if direct connectivity fails.
    ],
    'sdpSemantics': 'unified-plan',
  };

  Future<void> _ensure() async {
    if (_pc != null) return;
    _pc = await createPeerConnection(_config);
  }

  Future<void> _addMic() async {
    _localStream ??= await navigator.mediaDevices.getUserMedia({
      'audio': true,
      'video': false,
    });
    for (final track in _localStream!.getAudioTracks()) {
      await _pc!.addTrack(track, _localStream!);
    }
  }

  /// Outbound: build a local offer (full SDP after ICE gathering).
  Future<String> createOffer() async {
    await _ensure();
    await _addMic();
    final offer = await _pc!.createOffer({'offerToReceiveAudio': true});
    await _pc!.setLocalDescription(offer);
    return _completeLocalSdp();
  }

  /// Apply the remote answer (outbound, once the customer picks up).
  Future<void> setRemoteAnswer(String sdp) async {
    await _pc?.setRemoteDescription(RTCSessionDescription(sdp, 'answer'));
  }

  /// Inbound: apply the remote offer and build a local answer.
  Future<String> createAnswer(String remoteOfferSdp) async {
    await _ensure();
    await _pc!.setRemoteDescription(
      RTCSessionDescription(remoteOfferSdp, 'offer'),
    );
    await _addMic();
    final answer = await _pc!.createAnswer({'offerToReceiveAudio': true});
    await _pc!.setLocalDescription(answer);
    return _completeLocalSdp();
  }

  Future<void> setMuted(bool muted) async {
    for (final track in _localStream?.getAudioTracks() ?? const []) {
      track.enabled = !muted;
    }
  }

  /// Route call audio to the loudspeaker (true) or the earpiece (false).
  /// Best-effort: audio still works if the platform call throws.
  Future<void> setSpeaker(bool on) async {
    try {
      await Helper.setSpeakerphoneOn(on);
    } catch (e) {
      if (kDebugMode) debugPrint('[webrtc] setSpeaker: $e');
    }
  }

  /// Total RTP bytes received on the inbound audio track, or -1 when stats are
  /// unavailable. WhatsApp delivers the SDP answer while the callee is still
  /// RINGING, so media bytes flowing is the only reliable "picked up" signal.
  Future<int> inboundAudioBytes() async {
    final pc = _pc;
    if (pc == null) return -1;
    try {
      final stats = await pc.getStats();
      var total = 0;
      var found = false;
      for (final s in stats) {
        if (s.type == 'inbound-rtp') {
          final kind = '${s.values['kind'] ?? s.values['mediaType'] ?? ''}';
          if (kind == 'audio' || kind.isEmpty) {
            final b = s.values['bytesReceived'];
            if (b is num) {
              total += b.toInt();
              found = true;
            }
          }
        }
      }
      return found ? total : 0;
    } catch (e) {
      if (kDebugMode) debugPrint('[webrtc] stats: $e');
      return -1;
    }
  }

  Future<void> dispose() async {
    try {
      for (final t in _localStream?.getTracks() ?? const []) {
        await t.stop();
      }
      await _localStream?.dispose();
      await _pc?.close();
    } catch (e) {
      if (kDebugMode) debugPrint('[webrtc] dispose: $e');
    }
    _localStream = null;
    _pc = null;
  }

  /// Wait for ICE gathering to complete (capped), then return the full SDP.
  Future<String> _completeLocalSdp() async {
    final pc = _pc!;
    if (pc.iceGatheringState !=
        RTCIceGatheringState.RTCIceGatheringStateComplete) {
      final completer = Completer<void>();
      Timer? cap;
      pc.onIceGatheringState = (state) {
        if (state == RTCIceGatheringState.RTCIceGatheringStateComplete &&
            !completer.isCompleted) {
          cap?.cancel();
          completer.complete();
        }
      };
      // Fallback: don't block forever if the 'complete' event is missed.
      cap = Timer(const Duration(seconds: 3), () {
        if (!completer.isCompleted) completer.complete();
      });
      await completer.future;
    }
    final local = await pc.getLocalDescription();
    return local?.sdp ?? '';
  }
}
