/// Lifecycle of an active call (UI state machine).
enum CallPhase {
  requesting, // outbound: waiting for the customer to grant call permission
  ringing, // outbound: offer sent, waiting for pickup
  incoming, // inbound: ringing on this device, awaiting accept/reject
  connecting, // answer being exchanged
  connected, // media flowing
  ended,
  failed,
}

class CallSession {
  const CallSession({
    required this.callId,
    required this.conversationId,
    required this.inbound,
    required this.contactName,
    required this.contactPhone,
    required this.phase,
    this.muted = false,
    this.speakerOn = false,
    this.connectedAt,
    this.message,
    this.pendingOffer,
  });

  final String callId;
  final String conversationId;
  final bool inbound;
  final String contactName;
  final String contactPhone;
  final CallPhase phase;
  final bool muted;
  final bool speakerOn;
  final DateTime? connectedAt;
  final String? message;

  /// Inbound only: the remote SDP offer to answer.
  final String? pendingOffer;

  bool get isActive =>
      phase != CallPhase.ended && phase != CallPhase.failed;

  CallSession copyWith({
    String? callId,
    String? contactName,
    String? contactPhone,
    CallPhase? phase,
    bool? muted,
    bool? speakerOn,
    DateTime? connectedAt,
    String? message,
    String? pendingOffer,
  }) {
    return CallSession(
      callId: callId ?? this.callId,
      conversationId: conversationId,
      inbound: inbound,
      contactName: contactName ?? this.contactName,
      contactPhone: contactPhone ?? this.contactPhone,
      phase: phase ?? this.phase,
      muted: muted ?? this.muted,
      speakerOn: speakerOn ?? this.speakerOn,
      connectedAt: connectedAt ?? this.connectedAt,
      message: message ?? this.message,
      pendingOffer: pendingOffer ?? this.pendingOffer,
    );
  }
}
