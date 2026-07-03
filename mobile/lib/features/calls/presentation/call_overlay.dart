import 'dart:async';

import 'package:flutter/material.dart';
import '../../../core/utils/haptics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:proximity_sensor/proximity_sensor.dart';

import '../../../app/theme/app_colors.dart';
import '../../../core/i18n/i18n.dart';
import '../domain/call_session.dart';
import 'call_controller.dart';

/// Wraps the app; renders a full-screen call UI on top whenever a call is
/// active (outbound, inbound ring, or connected). Wire via MaterialApp.builder.
class CallOverlay extends ConsumerWidget {
  const CallOverlay({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(callControllerProvider);
    return Stack(
      children: [
        child,
        if (session != null)
          Positioned.fill(child: _CallScreen(session: session)),
      ],
    );
  }
}

class _CallScreen extends ConsumerStatefulWidget {
  const _CallScreen({required this.session});
  final CallSession session;

  @override
  ConsumerState<_CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends ConsumerState<_CallScreen> {
  Timer? _ticker;
  Duration _elapsed = Duration.zero;
  bool _isNear = false;
  StreamSubscription<dynamic>? _proximitySub;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      final at = widget.session.connectedAt;
      if (at != null && mounted) {
        setState(() => _elapsed = DateTime.now().difference(at));
      }
    });

    _proximitySub = ProximitySensor.events.listen((int event) {
      if (mounted) setState(() => _isNear = event > 0);
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _proximitySub?.cancel();
    super.dispose();
  }

  String get _status {
    final s = ref.watch(callControllerProvider) ?? widget.session;
    switch (s.phase) {
      case CallPhase.requesting:
        // Outbound is waiting for the customer to approve the call permission -
        // say so explicitly instead of implying the phone is already ringing.
        return 'Awaiting permission';
      case CallPhase.connecting:
        // Permission granted, placing the call (dialing).
        return 'Calling...';
      case CallPhase.ringing:
        // Offer delivered - the customer's phone is now ringing.
        return 'Ringing...';
      case CallPhase.incoming:
        return 'Incoming call';
      case CallPhase.connected:
        return _fmt(_elapsed);
      case CallPhase.ended:
        final m = s.message;
        if (m == 'remote_hangup' || m == 'local_hangup') return 'Call ended';
        if (m == 'remote_rejected') return 'Call declined';
        if (m == null || m.isEmpty) return 'Call ended';
        return m.length > 25 ? '${m.substring(0, 25)}...' : m;
      case CallPhase.failed:
        final m = s.message;
        if (m == null || m.isEmpty) return 'Call failed';
        return m.length > 25 ? '${m.substring(0, 25)}...' : m;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isNear) {
      return Container(color: Colors.black);
    }

    final s = ref.watch(callControllerProvider) ?? widget.session;
    final controller = ref.read(callControllerProvider.notifier);
    final initials = s.contactName.trim().isNotEmpty
        ? s.contactName.trim().substring(0, 1).toUpperCase()
        : '?';

    return Material(
      color: AppColors.brandInk,
      child: SafeArea(
        child: Column(
          children: [
            const Spacer(flex: 2),
            CircleAvatar(
              radius: 48,
              backgroundColor: Colors.white.withValues(alpha: 0.12),
              child: Text(initials,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 34,
                      fontWeight: FontWeight.w700)),
            ),
            const SizedBox(height: 20),
            Text(
              s.contactName.isNotEmpty ? s.contactName : s.contactPhone,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Text(_status.tr(context),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.7),
                      fontSize: 16)),
            ),
            const Spacer(flex: 3),
            _Controls(session: s, controller: controller),
            const SizedBox(height: 36),
          ],
        ),
      ),
    );
  }

  String _fmt(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final sec = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$sec';
  }
}

class _Controls extends StatelessWidget {
  const _Controls({required this.session, required this.controller});
  final CallSession session;
  final CallController controller;

  @override
  Widget build(BuildContext context) {
    if (session.phase == CallPhase.incoming) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _RoundAction(
            icon: Icons.call_end_rounded,
            color: AppColors.danger,
            label: 'Decline',
            onTap: () {
              Haptics.medium;
              controller.rejectIncoming();
            },
          ),
          _RoundAction(
            icon: Icons.call_rounded,
            color: AppColors.success,
            label: 'Accept',
            onTap: () {
              Haptics.medium;
              controller.acceptIncoming();
            },
          ),
        ],
      );
    }

    if (session.phase == CallPhase.ended ||
        session.phase == CallPhase.failed) {
      return _RoundAction(
        icon: Icons.close_rounded,
        color: Colors.white24,
        label: 'Close',
        onTap: () {
          Haptics.selection;
          controller.clear();
        },
      );
    }

    final connected = session.phase == CallPhase.connected;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _RoundAction(
          icon: session.muted ? Icons.mic_off_rounded : Icons.mic_rounded,
          color: session.muted ? Colors.white : Colors.white24,
          iconColor: session.muted ? AppColors.brandInk : Colors.white,
          label: 'Mute',
          onTap: connected ? () {
            Haptics.selection;
            controller.toggleMute();
          } : null,
        ),
        _RoundAction(
          icon: session.speakerOn
              ? Icons.volume_up_rounded
              : Icons.volume_down_rounded,
          color: session.speakerOn ? Colors.white : Colors.white24,
          iconColor: session.speakerOn ? AppColors.brandInk : Colors.white,
          label: 'Speaker',
          onTap: connected ? () {
            Haptics.selection;
            controller.toggleSpeaker();
          } : null,
        ),
        _RoundAction(
          icon: Icons.call_end_rounded,
          color: AppColors.danger,
          label: 'End',
          onTap: () {
            Haptics.medium;
            controller.hangUp();
          },
        ),
      ],
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({
    required this.icon,
    required this.color,
    required this.label,
    required this.onTap,
    this.iconColor = Colors.white,
  });
  final IconData icon;
  final Color color;
  final Color iconColor;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Material(
          color: color,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Icon(icon, color: iconColor, size: 28),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(label.tr(context),
            style: TextStyle(
                color: Colors.white.withValues(alpha: onTap == null ? 0.4 : 0.8),
                fontSize: 12)),
      ],
    );
  }
}


