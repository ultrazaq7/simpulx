import 'dart:async';
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
/// Uses static helper methods for reliable fire-and-forget haptic feedback.
class Haptics {
  Haptics._();

  /// Schedules haptic feedback. Safe to call without await (fire-and-forget).
  static void feedback(HapticType type) {
    switch (type) {
      case HapticType.light:
        HapticFeedback.lightImpact();
      case HapticType.medium:
        HapticFeedback.mediumImpact();
      case HapticType.heavy:
        HapticFeedback.heavyImpact();
      case HapticType.success:
        HapticFeedback.mediumImpact();
        Future.delayed(const Duration(milliseconds: 50), HapticFeedback.lightImpact);
      case HapticType.error:
        HapticFeedback.heavyImpact();
        Future.delayed(const Duration(milliseconds: 100), HapticFeedback.heavyImpact);
      case HapticType.selection:
        HapticFeedback.selectionClick();
      case HapticType.vibrate:
        HapticFeedback.vibrate();
      case HapticType.doubleTap:
        HapticFeedback.lightImpact();
        Future.delayed(const Duration(milliseconds: 80), HapticFeedback.lightImpact);
    }
  }

  /// Light impact feedback
  static void get light => feedback(HapticType.light);

  /// Medium impact feedback
  static void get medium => feedback(HapticType.medium);

  /// Heavy impact feedback
  static void get heavy => feedback(HapticType.heavy);

  /// Success feedback (double tap pattern)
  static void get success => feedback(HapticType.success);

  /// Error feedback (heavy double tap)
  static void get error => feedback(HapticType.error);

  /// Selection click feedback
  static void get selection => feedback(HapticType.selection);

  /// Vibrate feedback
  static void get vibrate => feedback(HapticType.vibrate);

  /// Double tap feedback
  static void get doubleTap => feedback(HapticType.doubleTap);

  /// For button presses
  static void get buttonPress => feedback(HapticType.medium);

  /// For toggle switches
  static void get toggle => feedback(HapticType.light);

  /// For card/item selection
  static void get select => feedback(HapticType.selection);

  /// For destructive actions
  static void get destructive => feedback(HapticType.heavy);

  /// For successful completion
  static void get completed => feedback(HapticType.success);
}
