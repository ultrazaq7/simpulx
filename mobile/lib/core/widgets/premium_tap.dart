import 'package:flutter/material.dart';
import '../utils/haptics.dart';
import '../utils/animation_constants.dart';

/// A widget that provides premium tap interactions with scale, haptic, and ripple effects.
/// Replaces standard GestureDetector/InkWell for consistent premium feel.
class PremiumTap extends StatefulWidget {
  const PremiumTap({
    super.key,
    required this.child,
    required this.onTap,
    this.scale = 0.97,
    this.enableHaptics = true,
    this.enableScale = true,
    this.borderRadius,
    this.rippleColor,
    this.splashRadius,
    this.padding,
    this.onTapDown,
    this.onTapUp,
    this.onTapCancel,
    this.isLoading = false,
    this.isSuccess = false,
    this.successColor,
  });

  /// The child widget to wrap
  final Widget child;

  /// Callback when tapped
  final VoidCallback? onTap;

  /// Scale factor on press (0.0 to 1.0). Default is 0.97
  final double scale;

  /// Whether to trigger haptic feedback on tap
  final bool enableHaptics;

  /// Whether to animate scale on press
  final bool enableScale;

  /// Border radius for ripple effect
  final BorderRadius? borderRadius;

  /// Custom ripple color
  final Color? rippleColor;

  /// Splash radius for ripple effect
  final double? splashRadius;

  /// Padding around the child
  final EdgeInsetsGeometry? padding;

  /// Callback when tap down starts
  final VoidCallback? onTapDown;

  /// Callback when tap ends
  final VoidCallback? onTapUp;

  /// Callback when tap is cancelled
  final VoidCallback? onTapCancel;

  /// Show loading state (disables interactions)
  final bool isLoading;

  /// Show success state (with checkmark animation)
  final bool isSuccess;

  /// Color for success state
  final Color? successColor;

  @override
  State<PremiumTap> createState() => _PremiumTapState();
}

class _PremiumTapState extends State<PremiumTap>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _successAnimation;
  bool _showSuccess = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: AnimDurations.fast,
      vsync: this,
    );

    _scaleAnimation = Tween<double>(begin: 1.0, end: widget.scale).animate(
      CurvedAnimation(
        parent: _controller,
        curve: AnimCurves.smoothOut,
        reverseCurve: AnimCurves.bouncy,
      ),
    );

    _successAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: AnimCurves.bouncy,
      ),
    );
  }

  @override
  void didUpdateWidget(PremiumTap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isSuccess && !oldWidget.isSuccess) {
      _showSuccess = true;
      _controller.forward(from: 0).then((_) {
        Future.delayed(const Duration(milliseconds: 1200), () {
          if (mounted) {
            setState(() => _showSuccess = false);
            _controller.reverse();
          }
        });
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleTapDown(TapDownDetails details) {
    if (widget.isLoading) return;
    if (widget.enableScale) {
      _controller.forward();
    }
    widget.onTapDown?.call();
  }

  void _handleTapUp(TapUpDetails details) {
    if (widget.isLoading) return;
    if (widget.enableScale) {
      _controller.reverse();
    }
    widget.onTapUp?.call();
  }

  void _handleTapCancel() {
    if (widget.isLoading) return;
    if (widget.enableScale) {
      _controller.reverse();
    }
    widget.onTapCancel?.call();
  }

  void _handleTap() {
    if (widget.isLoading || widget.onTap == null) return;

    if (widget.enableHaptics) {
      Haptics.buttonPress();
    }
    widget.onTap!();
  }

  @override
  Widget build(BuildContext context) {
    Widget child = AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: widget.enableScale ? _scaleAnimation.value : 1.0,
          child: child,
        );
      },
      child: widget.child,
    );

    // Wrap with loading or success overlay if needed
    if (widget.isLoading || _showSuccess) {
      child = Stack(
        alignment: Alignment.center,
        children: [
          Opacity(
            opacity: widget.isLoading ? 0.5 : 1.0,
            child: child,
          ),
          if (widget.isLoading)
            SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
          if (_showSuccess)
            AnimatedBuilder(
              animation: _successAnimation,
              builder: (context, _) {
                return Transform.scale(
                  scale: _successAnimation.value,
                  child: Icon(
                    Icons.check_rounded,
                    size: 32,
                    color: widget.successColor ?? Colors.white,
                  ),
                );
              },
            ),
        ],
      );
    }

    return GestureDetector(
      onTapDown: _handleTapDown,
      onTapUp: _handleTapUp,
      onTapCancel: _handleTapCancel,
      onTap: _handleTap,
      child: widget.padding != null
          ? Padding(padding: widget.padding!, child: child)
          : child,
    );
  }
}

/// A button with premium press effects.
/// Replaces ElevatedButton, FilledButton, OutlinedButton for consistent feel.
class PremiumButton extends StatefulWidget {
  const PremiumButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.style,
    this.prefixIcon,
    this.suffixIcon,
    this.isLoading = false,
    this.isSuccess = false,
    this.fullWidth = true,
    this.height = 52,
    this.borderRadius = 14,
  });

  final VoidCallback? onPressed;
  final Widget child;
  final ButtonStyle? style;
  final IconData? prefixIcon;
  final IconData? suffixIcon;
  final bool isLoading;
  final bool isSuccess;
  final bool fullWidth;
  final double height;
  final double borderRadius;

  @override
  State<PremiumButton> createState() => _PremiumButtonState();
}

class _PremiumButtonState extends State<PremiumButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _glowAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: AnimDurations.fast,
      vsync: this,
    );

    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.96).animate(
      CurvedAnimation(
        parent: _controller,
        curve: AnimCurves.smoothOut,
        reverseCurve: AnimCurves.bouncy,
      ),
    );

    _glowAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: AnimCurves.smoothOut,
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primaryColor = theme.colorScheme.primary;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: _scaleAnimation.value,
          child: Container(
            width: widget.fullWidth ? double.infinity : null,
            height: widget.height,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(widget.borderRadius),
              boxShadow: [
                BoxShadow(
                  color: primaryColor.withValues(alpha: 0.3 * _glowAnimation.value),
                  blurRadius: 16,
                  spreadRadius: 0,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: child,
          ),
        );
      },
      child: GestureDetector(
        onTapDown: (_) {
          if (widget.onPressed != null && !widget.isLoading) {
            _controller.forward();
            Haptics.feedback(HapticType.medium);
          }
        },
        onTapUp: (_) {
          _controller.reverse();
        },
        onTapCancel: () {
          _controller.reverse();
        },
        onTap: widget.isLoading ? null : widget.onPressed,
        child: AnimatedContainer(
          duration: AnimDurations.fast,
          decoration: BoxDecoration(
            color: widget.isLoading
                ? primaryColor.withValues(alpha: 0.7)
                : primaryColor,
            borderRadius: BorderRadius.circular(widget.borderRadius),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            mainAxisSize:
                widget.fullWidth ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (widget.isLoading)
                SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: theme.colorScheme.onPrimary,
                  ),
                )
              else if (widget.isSuccess)
                Icon(Icons.check_rounded,
                    color: theme.colorScheme.onPrimary, size: 22)
              else ...[
                if (widget.prefixIcon != null) ...[
                  Icon(widget.prefixIcon,
                      color: theme.colorScheme.onPrimary, size: 20),
                  const SizedBox(width: 10),
                ],
                DefaultTextStyle(
                  style: TextStyle(
                    color: theme.colorScheme.onPrimary,
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                  child: widget.child,
                ),
                if (widget.suffixIcon != null) ...[
                  const SizedBox(width: 10),
                  Icon(widget.suffixIcon,
                      color: theme.colorScheme.onPrimary, size: 20),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}
