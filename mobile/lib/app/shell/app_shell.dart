import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:simpulx/l10n/app_localizations.dart';

import '../../core/realtime/realtime_providers.dart';
import '../../core/utils/animation_constants.dart';
import '../../core/utils/haptics.dart';
import '../../features/chat/presentation/controllers/conversation_list_controller.dart';

/// Premium app shell with animated bottom navigation.
/// Features: animated badge updates, smooth tab transitions, haptic feedback.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);

    // Keep the realtime connection alive for the whole authenticated session
    ref.watch(realtimeClientProvider);
    final unread = ref.watch(totalUnreadProvider);

    void goBranch(int index) {
      if (index != navigationShell.currentIndex) {
        Haptics.light;
      }
      navigationShell.goBranch(
        index,
        initialLocation: index == navigationShell.currentIndex,
      );
    }

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: _PremiumNavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: goBranch,
        unreadCount: unread,
        destinations: [
          _NavDestination(
            icon: Icons.dashboard_outlined,
            selectedIcon: Icons.dashboard_rounded,
            label: l10n.navDashboard,
          ),
          _NavDestination(
            icon: Icons.chat_bubble_outline_rounded,
            selectedIcon: Icons.chat_bubble_rounded,
            label: l10n.navChat,
            showBadge: true,
          ),
          _NavDestination(
            icon: Icons.people_outline_rounded,
            selectedIcon: Icons.people_rounded,
            label: l10n.navContacts,
          ),
          _NavDestination(
            icon: Icons.settings_outlined,
            selectedIcon: Icons.settings_rounded,
            label: l10n.navSettings,
          ),
        ],
      ),
    );
  }
}

class _NavDestination {
  const _NavDestination({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    this.showBadge = false,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool showBadge;
}

/// Premium navigation bar with animated indicators.
class _PremiumNavigationBar extends StatelessWidget {
  const _PremiumNavigationBar({
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.destinations,
    required this.unreadCount,
  });

  final int selectedIndex;
  final void Function(int) onDestinationSelected;
  final List<_NavDestination> destinations;
  final int unreadCount;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primaryColor = theme.colorScheme.primary;

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: Container(
          height: 64,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(destinations.length, (index) {
              final dest = destinations[index];
              final isSelected = index == selectedIndex;

              return _NavItem(
                icon: dest.icon,
                selectedIcon: dest.selectedIcon,
                label: dest.label,
                isSelected: isSelected,
                primaryColor: primaryColor,
                showBadge: dest.showBadge,
                badgeCount: dest.showBadge ? unreadCount : 0,
                onTap: () => onDestinationSelected(index),
              );
            }),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatefulWidget {
  const _NavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.isSelected,
    required this.primaryColor,
    required this.showBadge,
    required this.badgeCount,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool isSelected;
  final Color primaryColor;
  final bool showBadge;
  final int badgeCount;
  final VoidCallback onTap;

  @override
  State<_NavItem> createState() => _NavItemState();
}

class _NavItemState extends State<_NavItem>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _bounceAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: AnimDurations.medium,
      vsync: this,
    );

    _scaleAnimation = Tween<double>(begin: 1.0, end: 1.2).animate(
      CurvedAnimation(
        parent: _controller,
        curve: AnimCurves.bouncy,
      ),
    );

    _bounceAnimation = Tween<double>(begin: 0.0, end: -4.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: AnimCurves.smoothOut,
      ),
    );
  }

  @override
  void didUpdateWidget(_NavItem oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isSelected && !oldWidget.isSelected) {
      _controller.forward().then((_) => _controller.reverse());
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = widget.isSelected
        ? widget.primaryColor
        : theme.colorScheme.onSurface.withValues(alpha: 0.6);

    return GestureDetector(
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 64,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            return Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Transform.translate(
                  offset: Offset(0, _bounceAnimation.value),
                  child: Transform.scale(
                    scale: widget.isSelected ? _scaleAnimation.value : 1.0,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        AnimatedSwitcher(
                          duration: AnimDurations.fast,
                          child: Icon(
                            widget.isSelected
                                ? widget.selectedIcon
                                : widget.icon,
                            key: ValueKey(widget.isSelected),
                            color: color,
                            size: 26,
                          ),
                        ),
                        if (widget.showBadge && widget.badgeCount > 0)
                          Positioned(
                            right: -8,
                            top: -4,
                            child: ScaleTransition(
                              scale: _scaleAnimation,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 4, vertical: 1),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF25D366),
                                  borderRadius: BorderRadius.circular(10),
                                  boxShadow: [
                                    BoxShadow(
                                      color: const Color(0xFF25D366)
                                          .withValues(alpha: 0.4),
                                      blurRadius: 4,
                                      offset: const Offset(0, 2),
                                    ),
                                  ],
                                ),
                                constraints: const BoxConstraints(
                                  minWidth: 18,
                                  minHeight: 18,
                                ),
                                child: Text(
                                  widget.badgeCount > 99
                                      ? '99+'
                                      : '${widget.badgeCount}',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                AnimatedDefaultTextStyle(
                  duration: AnimDurations.fast,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight:
                        widget.isSelected ? FontWeight.w700 : FontWeight.w600,
                    color: color,
                  ),
                  child: Text(widget.label),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
