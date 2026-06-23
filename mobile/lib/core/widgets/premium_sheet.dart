import 'package:flutter/material.dart';
import '../utils/animation_constants.dart';

/// Premium bottom sheet with spring physics and blur backdrop.
class PremiumBottomSheet extends StatefulWidget {
  const PremiumBottomSheet({
    super.key,
    required this.child,
    this.onClose,
    this.initialChildSize = 0.5,
    this.minChildSize = 0.25,
    this.maxChildSize = 0.9,
    this.snap = true,
    this.showDragHandle = true,
    this.backgroundColor,
    this.borderRadius = 24,
  });

  final Widget child;
  final VoidCallback? onClose;
  final double initialChildSize;
  final double minChildSize;
  final double maxChildSize;
  final bool snap;
  final bool showDragHandle;
  final Color? backgroundColor;
  final double borderRadius;

  @override
  State<PremiumBottomSheet> createState() => _PremiumBottomSheetState();
}

class _PremiumBottomSheetState extends State<PremiumBottomSheet>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: AnimDurations.slow,
      vsync: this,
    );
    _animation = CurvedAnimation(
      parent: _controller,
      curve: AnimCurves.bouncy,
    );
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _close() async {
    await _controller.reverse();
    if (mounted) widget.onClose?.call();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return Transform.translate(
          offset: Offset(0, (1 - _animation.value) * 300),
          child: Opacity(
            opacity: _animation.value,
            child: child,
          ),
        );
      },
      child: Container(
        decoration: BoxDecoration(
          color: widget.backgroundColor ??
              (isDark ? const Color(0xFF1A1A1A) : Colors.white),
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(widget.borderRadius),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.15),
              blurRadius: 20,
              offset: const Offset(0, -5),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (widget.showDragHandle)
              Container(
                margin: const EdgeInsets.only(top: 12),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            Flexible(child: widget.child),
          ],
        ),
      ),
    );
  }
}

/// Show premium bottom sheet helper
Future<T?> showPremiumBottomSheet<T>({
  required BuildContext context,
  required Widget child,
  bool isDismissible = true,
  bool enableDrag = true,
  Color? backgroundColor,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isDismissible: isDismissible,
    enableDrag: enableDrag,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (context) => PremiumBottomSheet(
      backgroundColor: backgroundColor,
      onClose: () => Navigator.of(context).pop(),
      child: child,
    ),
  );
}

/// Animated action sheet item
class ActionSheetItem extends StatefulWidget {
  const ActionSheetItem({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
    this.destructive = false,
    this.delay = Duration.zero,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
  final bool destructive;
  final Duration delay;

  @override
  State<ActionSheetItem> createState() => _ActionSheetItemState();
}

class _ActionSheetItemState extends State<ActionSheetItem>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<double> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: AnimDurations.medium,
      vsync: this,
    );
    _fadeAnimation = Tween<double>(begin: 0, end: 1).animate(_controller);
    _slideAnimation = Tween<double>(begin: 30, end: 0).animate(
      CurvedAnimation(parent: _controller, curve: AnimCurves.smoothOut),
    );

    Future.delayed(widget.delay, () {
      if (mounted) _controller.forward();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = widget.destructive
        ? Colors.red
        : (widget.color ?? theme.colorScheme.primary);

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.translate(
          offset: Offset(0, _slideAnimation.value),
          child: Opacity(
            opacity: _fadeAnimation.value,
            child: child,
          ),
        );
      },
      child: ListTile(
        leading: Icon(widget.icon, color: color),
        title: Text(
          widget.label,
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w600,
          ),
        ),
        onTap: widget.onTap,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }
}
