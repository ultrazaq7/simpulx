import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../utils/animation_constants.dart';

/// Page route transitions for premium navigation feel.
class PremiumPageRoute<T> extends PageRouteBuilder<T> {
  PremiumPageRoute({
    required Widget page,
    RouteSettings? settings,
    this.transitionType = PremiumTransitionType.fadeScale,
  }) : super(
          pageBuilder: (context, animation, secondaryAnimation) => page,
          settings: settings,
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return PremiumTransitions.build(
              transitionType,
              animation,
              secondaryAnimation,
              child,
            );
          },
          transitionDuration: AnimDurations.medium,
          reverseTransitionDuration: AnimDurations.medium,
        );

  final PremiumTransitionType transitionType;
}

/// Types of premium page transitions.
enum PremiumTransitionType {
  fadeScale,
  slideUp,
  slideRight,
  sharedAxis,
  fadeThrough,
  musicPlayer,
}

/// Collection of premium transition animations.
class PremiumTransitions {
  PremiumTransitions._();

  /// Build a transition based on type.
  static Widget build(
    PremiumTransitionType type,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    switch (type) {
      case PremiumTransitionType.fadeScale:
        return _FadeScaleTransition(animation: animation, child: child);
      case PremiumTransitionType.slideUp:
        return _SlideUpTransition(animation: animation, child: child);
      case PremiumTransitionType.slideRight:
        return _SlideRightTransition(animation: animation, child: child);
      case PremiumTransitionType.sharedAxis:
        return _SharedAxisTransition(
          animation: animation,
          secondaryAnimation: secondaryAnimation,
          child: child,
        );
      case PremiumTransitionType.fadeThrough:
        return _FadeThroughTransition(
          animation: animation,
          secondaryAnimation: secondaryAnimation,
          child: child,
        );
      case PremiumTransitionType.musicPlayer:
        return _MusicPlayerTransition(animation: animation, child: child);
    }
  }
}

/// Fade and scale combined transition.
class _FadeScaleTransition extends StatelessWidget {
  const _FadeScaleTransition({
    required this.animation,
    required this.child,
  });

  final Animation<double> animation;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: CurvedAnimation(
        parent: animation,
        curve: AnimCurves.smoothOut,
      ),
      child: ScaleTransition(
        scale: Tween<double>(begin: 0.92, end: 1.0).animate(
          CurvedAnimation(
            parent: animation,
            curve: AnimCurves.bouncy,
          ),
        ),
        child: child,
      ),
    );
  }
}

/// Slide up transition (common for bottom sheets/modals).
class _SlideUpTransition extends StatelessWidget {
  const _SlideUpTransition({
    required this.animation,
    required this.child,
  });

  final Animation<double> animation;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SlideTransition(
      position: Tween<Offset>(
        begin: const Offset(0, 0.3),
        end: Offset.zero,
      ).animate(
        CurvedAnimation(
          parent: animation,
          curve: AnimCurves.bouncy,
        ),
      ),
      child: FadeTransition(
        opacity: animation,
        child: child,
      ),
    );
  }
}

/// Slide from right transition.
class _SlideRightTransition extends StatelessWidget {
  const _SlideRightTransition({
    required this.animation,
    required this.child,
  });

  final Animation<double> animation;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final slideAnimation = Tween<Offset>(
      begin: const Offset(1.0, 0.0),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(
        parent: animation,
        curve: AnimCurves.smoothOut,
      ),
    );

    return SlideTransition(
      position: slideAnimation,
      child: FadeTransition(
        opacity: CurvedAnimation(
          parent: animation,
          curve: const Interval(0.0, 0.5),
        ),
        child: child,
      ),
    );
  }
}

/// Shared axis transition (Material motion).
class _SharedAxisTransition extends StatelessWidget {
  const _SharedAxisTransition({
    required this.animation,
    required this.secondaryAnimation,
    required this.child,
  });

  final Animation<double> animation;
  final Animation<double> secondaryAnimation;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.0, end: 1.0).animate(
        CurvedAnimation(
          parent: animation,
          curve: const Interval(0.0, 0.5),
        ),
      ),
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0.1, 0.0),
          end: Offset.zero,
        ).animate(
          CurvedAnimation(
            parent: animation,
            curve: AnimCurves.smoothOut,
          ),
        ),
        child: child,
      ),
    );
  }
}

/// Fade through transition.
class _FadeThroughTransition extends StatelessWidget {
  const _FadeThroughTransition({
    required this.animation,
    required this.secondaryAnimation,
    required this.child,
  });

  final Animation<double> animation;
  final Animation<double> secondaryAnimation;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: CurvedAnimation(
        parent: animation,
        curve: const Interval(0.0, 0.5),
      ),
      child: ScaleTransition(
        scale: Tween<double>(begin: 0.95, end: 1.0).animate(
          CurvedAnimation(
            parent: animation,
            curve: AnimCurves.smoothOut,
          ),
        ),
        child: child,
      ),
    );
  }
}

/// Music player style transition (expand from bottom).
class _MusicPlayerTransition extends StatelessWidget {
  const _MusicPlayerTransition({
    required this.animation,
    required this.child,
  });

  final Animation<double> animation;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, _) {
        final curvedAnimation = CurvedAnimation(
          parent: animation,
          curve: AnimCurves.bouncy,
        );
        return ClipRRect(
          borderRadius: BorderRadius.lerp(
            const BorderRadius.vertical(top: Radius.circular(24)),
            BorderRadius.zero,
            curvedAnimation.value,
          ) ?? BorderRadius.zero,
          child: child,
        );
      },
    );
  }
}

/// Navigation shell transition builder for GoRouter.
class NavigationTransitions {
  NavigationTransitions._();

  /// Fade scale transition for tab navigation.
  static CustomTransitionPage<void> fadeScale({
    required Widget child,
    required LocalKey key,
  }) {
    return CustomTransitionPage<void>(
      key: key,
      child: child,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        return FadeTransition(
          opacity: CurvedAnimation(
            parent: animation,
            curve: AnimCurves.smoothOut,
          ),
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.95, end: 1.0).animate(
              CurvedAnimation(
                parent: animation,
                curve: AnimCurves.smoothOut,
              ),
            ),
            child: child,
          ),
        );
      },
      transitionDuration: AnimDurations.medium,
      reverseTransitionDuration: AnimDurations.medium,
    );
  }

  /// Slide up transition for full-screen pages.
  static CustomTransitionPage<void> slideUp({
    required Widget child,
    required LocalKey key,
  }) {
    return CustomTransitionPage<void>(
      key: key,
      child: child,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        return SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 1),
            end: Offset.zero,
          ).animate(
            CurvedAnimation(
              parent: animation,
              curve: AnimCurves.bouncy,
            ),
          ),
          child: child,
        );
      },
      transitionDuration: AnimDurations.slow,
      reverseTransitionDuration: AnimDurations.medium,
    );
  }

  /// Shared axis transition for related content.
  static CustomTransitionPage<void> sharedAxis({
    required Widget child,
    required LocalKey key,
  }) {
    return CustomTransitionPage<void>(
      key: key,
      child: child,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        return FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0.05, 0),
              end: Offset.zero,
            ).animate(
              CurvedAnimation(
                parent: animation,
                curve: AnimCurves.smooth,
              ),
            ),
            child: child,
          ),
        );
      },
      transitionDuration: AnimDurations.medium,
      reverseTransitionDuration: AnimDurations.medium,
    );
  }
}
