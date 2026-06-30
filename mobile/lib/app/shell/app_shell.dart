import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:simpulx/l10n/app_localizations.dart';

import '../../core/realtime/realtime_providers.dart';
import '../../features/chat/presentation/controllers/conversation_list_controller.dart';

/// Root scaffold hosting the 4 primary tabs via an [IndexedStack] so each
/// branch keeps its own navigation + scroll state.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  void _goBranch(int index) {
    navigationShell.goBranch(
      index,
      // Re-tapping the active tab pops to its root.
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);

    // Keep the realtime connection alive for the whole authenticated session
    // (drives live unread badges + inbox updates even off the Chat tab).
    ref.watch(realtimeClientProvider);
    final unread = ref.watch(totalUnreadProvider);

    return Scaffold(
      body: navigationShell,
      // Hairline above the bar so it reads as a distinct surface on the clean
      // white scaffold (WhatsApp-style). foreground so it paints OVER the bar's
      // opaque top edge - a background border would be hidden behind it.
      bottomNavigationBar: DecoratedBox(
        position: DecorationPosition.foreground,
        decoration: BoxDecoration(
          border: Border(
              top: BorderSide(color: Theme.of(context).colorScheme.outline)),
        ),
        child: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
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
