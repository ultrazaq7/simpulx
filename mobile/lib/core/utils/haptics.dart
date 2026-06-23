import 'package:flutter/services.dart';

/// Enum for different haptic feedback types used across the app.
enum HapticType {
  /// Light selection feedback - for UI toggles, small interactions
  light,

  /// Medium impact - for button presses, standard actions
  medium,

  /// Heavy impact - for significant actions, destructive operations
  heavy,

  /// Success confirmation - for completed actions
  success,

  /// Error feedback - for failed actions
  error,

  /// Selection changed - for picker/scroller changes
  selection,

  /// Vibrate - for long-press triggers
  vibrate,

  /// Double tap - for double-tap interactions
  doubleTap,
}

/// Utility class providing consistent haptic feedback throughout the app.
class Haptics {
  Haptics._();

  /// Triggers haptic feedback based on type.
  /// Call this instead of HapticFeedback directly.
  static Future<void> feedback(HapticType type) async {
    switch (type) {
      case HapticType.light:
        await HapticFeedback.lightImpact();
      case HapticType.medium:
        await HapticFeedback.mediumImpact();
      case HapticType.heavy:
        await HapticFeedback.heavyImpact();
      case HapticType.success:
        await HapticFeedback.mediumImpact();
        await Future.delayed(const Duration(milliseconds: 50));
        await HapticFeedback.lightImpact();
      case HapticType.error:
        await HapticFeedback.heavyImpact();
        await Future.delayed(const Duration(milliseconds: 100));
        await HapticFeedback.heavyImpact();
      case HapticType.selection:
        await HapticFeedback.selectionClick();
      case HapticType.vibrate:
        await HapticFeedback.vibrate();
      case HapticType.doubleTap:
        await HapticFeedback.lightImpact();
        await Future.delayed(const Duration(milliseconds: 80));
        await HapticFeedback.lightImpact();
    }
  }

  /// Convenience methods for common scenarios
  static Future<void> get light => feedback(HapticType.light);
  static Future<void> get medium => feedback(HapticType.medium);
  static Future<void> get heavy => feedback(HapticType.heavy);
  static Future<void> get success => feedback(HapticType.success);
  static Future<void> get error => feedback(HapticType.error);
  static Future<void> get selection => feedback(HapticType.selection);
  static Future<void> get vibrate => feedback(HapticType.vibrate);
  static Future<void> get doubleTap => feedback(HapticType.doubleTap);

  /// For button presses - combines visual + haptic
  static Future<void> buttonPress() async {
    await medium;
  }

  /// For toggle switches
  static Future<void> toggle() async {
    await light;
  }

  /// For card/item selection
  static Future<void> select() async {
    await selection;
  }

  /// For destructive actions
  static Future<void> destructive() async {
    await heavy;
  }

  /// For successful completion
  static Future<void> completed() async {
    await success;
  }
}
