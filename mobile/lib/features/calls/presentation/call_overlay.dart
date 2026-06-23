import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_colors.dart';
import '../domain/call_session.dart';
import 'call_controller.dart';

/// Wraps the app; renders a full-screen WhatsApp-style call UI on top
/// whenever a call is active. Wire via MaterialApp.builder.
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

  String get _phaseLabel {
    final s = ref.watch(callControllerProvider) ?? widget.session;
    switch (s.phase) {
      case CallPhase.requesting:
        return s.message ?? 'Requesting...';
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

  String _fmt(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final sec = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$sec';
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(callControllerProvider) ?? widget.session;
    final ctrl = ref.read(callControllerProvider.notifier);

    final initials = s.contactName.trim().isNotEmpty
        ? s.contactName.trim().substring(0, 1).toUpperCase()
        : '?';

    final isIncoming = s.phase == CallPhase.incoming;
    final isEnded = s.phase == CallPhase.ended || s.phase == CallPhase.failed;
    final isConnected = s.phase == CallPhase.connected;

    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      body: SafeArea(
        child: Column(
          children: [
            // ── Top: name + status ───────────────────────────────
            const Spacer(flex: 2),
            _AvatarRing(name: s.contactName, initials: initials),
            const SizedBox(height: 24),
            Text(
              s.contactName.isNotEmpty ? s.contactName : s.contactPhone,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 26,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _phaseLabel,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.65),
                fontSize: 15,
                fontWeight: FontWeight.w400,
              ),
            ),
            const Spacer(flex: 3),

            // ── Controls ─────────────────────────────────────
            if (isIncoming)
              _IncomingControls(ctrl: ctrl)
            else if (isEnded)
              _EndControls(ctrl: ctrl)
            else if (isConnected)
              _ConnectedControls(session: s, ctrl: ctrl)
            else
              Center(
                child: _ActionPill(
                  icon: Icons.call_end_rounded,
                  color: AppColors.danger,
                  label: 'Cancel',
                  size: 60,
                  iconSize: 28,
                  onTap: ctrl.hangUp,
                ),
              ),

            const SizedBox(height: 36),
          ],
        ),
      ),
    );
  }
}

class _AvatarRing extends StatelessWidget {
  const _AvatarRing({required this.name, required this.initials});
  final String name;
  final String initials;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 120,
      height: 120,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Animated pulse ring for incoming
          const _PulseRing(),
          CircleAvatar(
            radius: 52,
            backgroundColor: AppColors.darkSurfaceAlt,
            child: Text(
              initials,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 42,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PulseRing extends StatefulWidget {
  const _PulseRing();

  @override
  State<_PulseRing> createState() => _PulseRingState();
}

class _PulseRingState extends State<_PulseRing>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        return Container(
          width: 120,
          height: 120,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
              color: AppColors.success
                  .withValues(alpha: 0.5 * (1 - _c.value)),
              width: 2,
            ),
          ),
        );
      },
    );
  }
}

class _IncomingControls extends StatelessWidget {
  const _IncomingControls({required this.ctrl});
  final CallController ctrl;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _ActionPill(
          icon: Icons.call_end_rounded,
          color: AppColors.danger,
          label: 'Decline',
          onTap: ctrl.rejectIncoming,
        ),
        _ActionPill(
          icon: Icons.call_rounded,
          color: AppColors.success,
          label: 'Accept',
          onTap: ctrl.acceptIncoming,
        ),
      ],
    );
  }
}

class _ConnectedControls extends StatelessWidget {
  const _ConnectedControls({required this.session, required this.ctrl});
  final CallSession session;
  final CallController ctrl;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _ActionPill(
          icon: session.muted ? Icons.mic_off_rounded : Icons.mic_rounded,
          color: session.muted
              ? Colors.white.withValues(alpha: 0.15)
              : Colors.white.withValues(alpha: 0.08),
          iconColor: session.muted ? AppColors.danger : Colors.white,
          label: session.muted ? 'Unmute' : 'Mute',
          size: 56,
          iconSize: 24,
          onTap: ctrl.toggleMute,
        ),
        _ActionPill(
          icon: Icons.call_end_rounded,
          color: AppColors.danger,
          label: 'End',
          size: 64,
          iconSize: 30,
          onTap: ctrl.hangUp,
        ),
      ],
    );
  }
}

class _EndControls extends StatelessWidget {
  const _EndControls({required this.ctrl});
  final CallController ctrl;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: TextButton.icon(
        onPressed: ctrl.clear,
        icon: const Icon(Icons.close_rounded, color: Colors.white54),
        label:
            const Text('Close', style: TextStyle(color: Colors.white54)),
      ),
    );
  }
}

/// Large circular action button used in the call screen.
class _ActionPill extends StatelessWidget {
  const _ActionPill({
    required this.icon,
    required this.color,
    required this.label,
    required this.onTap,
    this.iconColor = Colors.white,
    this.size = 60,
    this.iconSize = 28,
  });
  final IconData icon;
  final Color color;
  final Color iconColor;
  final String label;
  final VoidCallback onTap;
  final double size;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Material(
          color: color,
          shape: const CircleBorder(),
          elevation: 0,
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: SizedBox(
              width: size,
              height: size,
              child: Icon(icon, color: iconColor, size: iconSize),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.7),
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
