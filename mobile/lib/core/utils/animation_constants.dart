import 'package:flutter/animation.dart' show Curves, Curve;

/// Premium animation durations and curves used throughout the app.
/// Centralizes animation timing for consistency.
class AnimDurations {
  AnimDurations._();

  // Fast interactions
  static const Duration instant = Duration(milliseconds: 50);
  static const Duration fastest = Duration(milliseconds: 100);
  static const Duration fast = Duration(milliseconds: 150);
  static const Duration quick = Duration(milliseconds: 200);

  // Standard animations
  static const Duration normal = Duration(milliseconds: 250);
  static const Duration medium = Duration(milliseconds: 300);
  static const Duration slow = Duration(milliseconds: 400);
  static const Duration slower = Duration(milliseconds: 500);

  // Dramatic/long animations
  static const Duration dramatic = Duration(milliseconds: 600);
  static const Duration verySlow = Duration(milliseconds: 800);

  // Stagger delays
  static const Duration staggerShort = Duration(milliseconds: 50);
  static const Duration staggerNormal = Duration(milliseconds: 100);
  static const Duration staggerLong = Duration(milliseconds: 150);

  // Loops
  static const Duration pulse = Duration(milliseconds: 1000);
  static const Duration shimmer = Duration(milliseconds: 1500);
  static const Duration breathe = Duration(milliseconds: 2000);
  static const Duration cycle = Duration(milliseconds: 3000);
}

/// Custom curves for premium feel.
class AnimCurves {
  AnimCurves._();

  /// Smooth ease out - standard for appearing elements
  static const Curve smoothOut = Curves.easeOutCubic;

  /// Smooth ease in - standard for disappearing elements
  static const Curve smoothIn = Curves.easeInCubic;

  /// Bouncy spring effect for buttons
  static const Curve bouncy = Curves.elasticOut;

  /// Snappy spring for responsive elements
  static const Curve snappy = Curves.easeOutBack;

  /// Smooth overall - for most transitions
  static const Curve smooth = Curves.easeInOutCubic;

  /// Dramatic ease - for emphasis
  static const Curve dramatic = Curves.easeOutExpo;

  /// Overshoot effect for playful interactions
  static const Curve overshoot = Curves.elasticOut;

  /// Fast attack, slow release - for interactions
  static const Curve attackRelease = Curves.fastOutSlowIn;

  /// Spring curve approximation for bouncy buttons
  static const Curve spring = Curves.fastOutSlowIn;

  /// Material motion standard curves
  static const Curve decelerate = Curves.decelerate;
}

/// Animation configuration for different interaction types.
class AnimConfig {
  AnimConfig._();

  /// Button press animation config
  static const buttonPress = _AnimConfig(
    duration: Duration(milliseconds: 150),
    scale: 0.95,
  );

  /// Card tap animation config
  static const cardTap = _AnimConfig(
    duration: Duration(milliseconds: 150),
    scale: 0.98,
  );

  /// List item appear config
  static const listItem = _AnimConfig(
    duration: Duration(milliseconds: 300),
  );

  /// Page transition config
  static const pageTransition = _AnimConfig(
    duration: Duration(milliseconds: 300),
  );

  /// Modal sheet config
  static const modalSheet = _AnimConfig(
    duration: Duration(milliseconds: 400),
  );
}

class _AnimConfig {
  final Duration duration;
  final double? scale;
  final Curve curve;

  const _AnimConfig({
    required this.duration,
    this.scale,
    this.curve = Curves.easeInOutCubic,
  });
}
