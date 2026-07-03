import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:simpulx/l10n/app_localizations.dart';

import '../../core/realtime/realtime_providers.dart';
import '../../features/chat/presentation/controllers/conversation_list_controller.dart';

/// Root scaffold hosting the 4 primary tabs via an [IndexedStack] so each
/// branch keeps its own navigation + scroll state.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  static const int _tabCount = 4;

  // Accumulated horizontal travel of the in-progress drag, so a slow but
  // deliberate left/right drag switches tabs (not only a fast fling).
  double _dragDx = 0;

  void _goBranch(int index) {
    widget.navigationShell.goBranch(
      index,
      // Re-tapping the active tab pops to its root.
      initialLocation: index == widget.navigationShell.currentIndex,
    );
  }

  void _onDragStart(DragStartDetails _) => _dragDx = 0;
  void _onDragUpdate(DragUpdateDetails d) => _dragDx += d.delta.dx;

  // Switch tabs on a deliberate horizontal gesture: a fast fling OR a drag past
  // a distance threshold. This is a HorizontalDragGestureRecognizer, so vertical
  // scrolls never trigger it (they win the arena on their own axis) and the chat
  // list's swipe-to-archive tiles still claim the drag when it starts on a tile.
  void _onDragEnd(DragEndDetails d) {
    final v = d.primaryVelocity ?? 0;
    final dx = _dragDx;
    _dragDx = 0;
    final flung = v.abs() >= 320;
    final dragged = dx.abs() >= 64;
    if (!flung && !dragged) return;
    // Swipe left (negative) -> next tab; swipe right (positive) -> previous.
    final goNext = flung ? v < 0 : dx < 0;
    final i = widget.navigationShell.currentIndex;
    if (goNext && i < _tabCount - 1) {
      _goBranch(i + 1);
    } else if (!goNext && i > 0) {
      _goBranch(i - 1);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    // Keep the realtime connection alive for the whole authenticated session
    // (drives live unread badges + inbox updates even off the Chat tab).
    ref.watch(realtimeClientProvider);
    final unread = ref.watch(totalUnreadProvider);

    return Scaffold(
      body: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onHorizontalDragStart: _onDragStart,
        onHorizontalDragUpdate: _onDragUpdate,
        onHorizontalDragEnd: _onDragEnd,
        child: widget.navigationShell,
      ),
      // Hairline above the bar so it reads as a distinct surface on the clean
      // white scaffold (WhatsApp-style). foreground so it paints OVER the bar's
      // opaque top edge - a background border would be hidden behind it.
      bottomNavigationBar: DecoratedBox(
        position: DecorationPosition.foreground,
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.12),
              width: 0.5,
            ),
          ),
        ),
        child: NavigationBar(
        selectedIndex: widget.navigationShell.currentIndex,
        onDestinationSelected: _goBranch,
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.dashboard_outlined),
            selectedIcon: const Icon(Icons.dashboard_rounded),
            label: l10n.navDashboard,
          ),
          NavigationDestination(
            icon: _BadgedIcon(
              icon: Icons.chat_bubble_outline_rounded,
              count: unread,
            ),
            selectedIcon: _BadgedIcon(
              icon: Icons.chat_bubble_rounded,
              count: unread,
            ),
            label: l10n.navChat,
          ),
          NavigationDestination(
            icon: const Icon(Icons.people_outline_rounded),
            selectedIcon: const Icon(Icons.people_rounded),
            label: l10n.navContacts,
          ),
          NavigationDestination(
            icon: const Icon(Icons.settings_outlined),
            selectedIcon: const Icon(Icons.settings_rounded),
            label: l10n.navSettings,
          ),
        ],
        ),
      ),
    );
  }
}

class _BadgedIcon extends StatelessWidget {
  const _BadgedIcon({required this.icon, required this.count});
  final IconData icon;
  final int count;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return Icon(icon);
    return Badge(
      label: Text(count > 99 ? '99+' : '$count'),
      child: Icon(icon),
    );
  }
}
