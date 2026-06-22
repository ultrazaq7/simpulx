import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_colors.dart';
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

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      final at = widget.session.connectedAt;
      if (at != null && mounted) {
        setState(() => _elapsed = DateTime.now().difference(at));
      }
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  String get _status {
    final s = ref.watch(callControllerProvider) ?? widget.session;
    switch (s.phase) {
      case CallPhase.requesting:
        return s.message ?? 'Requesting permission...';
      case CallPhase.ringing:
        return 'Calling...';
      case CallPhase.incoming:
        return 'Incoming call';
      case CallPhase.connecting:
        return 'Connecting...';
      case CallPhase.connected:
        return _fmt(_elapsed);
      case CallPhase.ended:
        return s.message ?? 'Call ended';
      case CallPhase.failed:
        return s.message ?? 'Call failed';
    }
  }

  @override
  Widget build(BuildContext context) {
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
            Text(_status,
                style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.7), fontSize: 16)),
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
            onTap: controller.rejectIncoming,
          ),
          _RoundAction(
            icon: Icons.call_rounded,
            color: AppColors.success,
            label: 'Accept',
            onTap: controller.acceptIncoming,
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
        onTap: controller.clear,
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
          onTap: connected ? controller.toggleMute : null,
        ),
        _RoundAction(
          icon: Icons.call_end_rounded,
          color: AppColors.danger,
          label: 'End',
          onTap: controller.hangUp,
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
        Text(label,
            style: TextStyle(
                color: Colors.white.withValues(alpha: onTap == null ? 0.4 : 0.8),
                fontSize: 12)),
      ],
    );
  }
}
