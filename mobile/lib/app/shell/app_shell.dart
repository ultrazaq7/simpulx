import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:simpulx/l10n/app_localizations.dart';

import '../../core/realtime/realtime_providers.dart';
import '../../features/chat/presentation/controllers/conversation_list_controller.dart';

/// Root scaffold hosting the 4 primary tabs in a [PageView] so tabs swipe with
/// the finger (WhatsApp-style: the page tracks the drag and settles smoothly),
/// while each branch still keeps its own navigation + scroll state via the
/// stateful shell. Detail pages (chat thread, contact detail, ...) are
/// top-level routes that cover the shell, so a swipe never fires inside them.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({
    super.key,
    required this.navigationShell,
    required this.children,
  });

  final StatefulNavigationShell navigationShell;
  // The branch navigator widgets, laid out horizontally in the PageView.
  final List<Widget> children;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  late final PageController _pageController =
      PageController(initialPage: widget.navigationShell.currentIndex);

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  // Tap on the nav bar (or programmatic navigation).
  void _goBranch(int index) {
    widget.navigationShell.goBranch(
      index,
      // Re-tapping the active tab pops to its root.
      initialLocation: index == widget.navigationShell.currentIndex,
    );
  }

  // Swipe settled on a new page -> make it the active branch.
  void _onPageChanged(int index) {
    if (index != widget.navigationShell.currentIndex) {
      widget.navigationShell.goBranch(index);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    // Keep the realtime connection alive for the whole authenticated session
    // (drives live unread badges + inbox updates even off the Chat tab).
    ref.watch(realtimeClientProvider);
    final unread = ref.watch(totalUnreadProvider);

    // When the branch changes via the nav bar (not a swipe), JUMP the PageView
    // straight to it - no animation - so a tab tap is instant instead of
    // sliding through every page in between (e.g. Dashboard -> Settings). A
    // swipe still tracks the finger natively; there the page already matches
    // by the time this runs, so nothing happens here.
    final current = widget.navigationShell.currentIndex;
    if (_pageController.hasClients &&
        (_pageController.page?.round() ?? current) != current) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_pageController.hasClients) return;
        if ((_pageController.page?.round() ?? current) != current) {
          _pageController.jumpToPage(current);
        }
      });
    }

    return Scaffold(
      body: PageView(
        controller: _pageController,
        onPageChanged: _onPageChanged,
        physics: const ClampingScrollPhysics(),
        children: widget.children,
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
