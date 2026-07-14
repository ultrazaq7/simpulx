import 'dart:async';

import 'package:flutter/material.dart';

/// Lightweight toast rendered through the [Overlay] instead of a Material
/// SnackBar. This gives us a single clean pill with a subtle fade+rise — no
/// stray floating-SnackBar chrome (the old approach left a faint bordered
/// stadium behind the pill). Same API as before: `AppSnackbar.show(context, msg)`.
class AppSnackbar {
  static OverlayEntry? _entry;
  static Timer? _timer;

  static void show(BuildContext context, String message,
      {bool isError = false, Brightness? brightness}) {
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (overlay == null) return;

    // Toast matches the active theme: light bar + dark text on light, dark bar +
    // white text on dark. Callers that just switched the theme pass the target
    // [brightness] so the toast never reads a stale context mid-switch.
    final isDark =
        (brightness ?? Theme.of(context).brightness) == Brightness.dark;
    final bg = isDark ? const Color(0xFF2A3942) : const Color(0xFFECEFF1);
    final fg = isDark ? Colors.white : const Color(0xFF1C2B33);
    final errorFg =
        isDark ? const Color(0xFFFF6B6B) : const Color(0xFFD32F2F);

    _dismiss();

    final entry = OverlayEntry(
      builder: (_) => _Toast(
        message: message,
        bg: bg,
        fg: fg,
        iconColor: isError ? errorFg : fg,
        onGone: _dismiss,
      ),
    );
    _entry = entry;
    overlay.insert(entry);
  }

  static void _dismiss() {
    _timer?.cancel();
    _timer = null;
    _entry?.remove();
    _entry = null;
  }
}

class _Toast extends StatefulWidget {
  const _Toast({
    required this.message,
    required this.bg,
    required this.fg,
    required this.iconColor,
    required this.onGone,
  });

  final String message;
  final Color bg;
  final Color fg;
  final Color iconColor;
  final VoidCallback onGone;

  @override
  State<_Toast> createState() => _ToastState();
}

class _ToastState extends State<_Toast> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 190),
  );
  Timer? _hold;

  @override
  void initState() {
    super.initState();
    _c.forward();
    // Stay for ~2s, then fade back out and remove the overlay entry.
    _hold = Timer(const Duration(milliseconds: 2000), () async {
      if (!mounted) return;
      await _c.reverse();
      widget.onGone();
    });
  }

  @override
  void dispose() {
    _hold?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final curve = CurvedAnimation(parent: _c, curve: Curves.easeOutCubic);
    return Positioned(
      left: 16,
      right: 16,
      bottom: MediaQuery.of(context).padding.bottom + 88,
      child: IgnorePointer(
        child: Center(
          child: FadeTransition(
            opacity: curve,
            child: AnimatedBuilder(
              animation: curve,
              builder: (_, child) => Transform.translate(
                offset: Offset(0, (1 - curve.value) * 10),
                child: child,
              ),
              child: Material(
                color: Colors.transparent,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 18, vertical: 11),
                  decoration: BoxDecoration(
                    color: widget.bg,
                    borderRadius: BorderRadius.circular(999),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.18),
                        blurRadius: 16,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Image.asset(
                        'assets/images/logo.png',
                        height: 18,
                        width: 18,
                        color: widget.iconColor,
                      ),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          widget.message,
                          style: TextStyle(
                            color: widget.fg,
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
