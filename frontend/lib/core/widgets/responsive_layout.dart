// ============================================================
// Responsive Layout Widget
// Web/Desktop: 3-column | Mobile: 2-page flow
// ============================================================
import 'package:flutter/material.dart';

enum ScreenType { mobile, tablet, desktop }

class ResponsiveLayout extends StatelessWidget {
  final Widget conversationList;
  final Widget? activeChat;
  final Widget? infoPanel;
  final bool showInfoPanel;
  final bool showConversationList;
  final double conversationListWidth;

  const ResponsiveLayout({
    super.key,
    required this.conversationList,
    this.activeChat,
    this.infoPanel,
    this.showInfoPanel = false,
    this.showConversationList = true,
    this.conversationListWidth = 352,
  });

  static ScreenType getScreenType(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    if (width >= 1200) return ScreenType.desktop;
    if (width >= 768) return ScreenType.tablet;
    return ScreenType.mobile;
  }

  static bool isMobile(BuildContext context) =>
      getScreenType(context) == ScreenType.mobile;

  static bool isDesktop(BuildContext context) =>
      getScreenType(context) == ScreenType.desktop;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final screenType = getScreenType(context);

        switch (screenType) {
          case ScreenType.desktop:
            return _buildDesktopLayout(context);
          case ScreenType.tablet:
            return _buildTabletLayout(context);
          case ScreenType.mobile:
            return _buildMobileLayout(context);
        }
      },
    );
  }

  // ── Desktop: 3-Column Layout ──────────────────────────
  Widget _buildDesktopLayout(BuildContext context) {
    return Row(
      children: [
        if (showConversationList)
          SizedBox(
            width: conversationListWidth,
            child: _buildPanel(
              context: context,
              child: conversationList,
              borderRight: true,
            ),
          ),

        // Column 2: Active Chat (flexible)
        Expanded(
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Theme.of(context).scaffoldBackgroundColor,
            ),
            child: activeChat ?? _buildEmptyState(context),
          ),
        ),

        // Column 3: Info Panel (320px, toggleable)
        if (showInfoPanel && infoPanel != null)
          SizedBox(
            width: 340,
            child: _buildPanel(
              context: context,
              child: infoPanel!,
              borderLeft: true,
            ),
          ),
      ],
    );
  }

  // ── Tablet: 2-Column Layout ───────────────────────────
  Widget _buildTabletLayout(BuildContext context) {
    final maxListWidth = MediaQuery.of(context).size.width * 0.52;
    final listWidth = conversationListWidth > maxListWidth
        ? maxListWidth
        : conversationListWidth;

    return Row(
      children: [
        if (showConversationList)
          SizedBox(
            width: listWidth,
            child: _buildPanel(
              context: context,
              child: conversationList,
              borderRight: true,
            ),
          ),

        // Active Chat (flexible)
        Expanded(
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Theme.of(context).scaffoldBackgroundColor,
            ),
            child: activeChat ?? _buildEmptyState(context),
          ),
        ),
      ],
    );
  }

  // ── Mobile: Single View (uses navigation) ─────────────
  Widget _buildMobileLayout(BuildContext context) {
    // On mobile, if activeChat is set, show it; otherwise show list
    if (activeChat != null) {
      return activeChat!;
    }
    return conversationList;
  }

  // ── Panel Container ───────────────────────────────────
  Widget _buildPanel({
    required BuildContext context,
    required Widget child,
    bool borderLeft = false,
    bool borderRight = false,
  }) {
    final divider = Theme.of(context).dividerColor;
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(
          left: borderLeft
              ? BorderSide(color: divider, width: 1)
              : BorderSide.none,
          right: borderRight
              ? BorderSide(color: divider, width: 1)
              : BorderSide.none,
        ),
      ),
      child: child,
    );
  }

  // ── Empty State ───────────────────────────────────────
  Widget _buildEmptyState(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: theme.colorScheme.primary.withValues(alpha: 0.08),
                border: Border.all(
                  color: theme.colorScheme.primary.withValues(alpha: 0.10),
                ),
              ),
              child: Icon(
                Icons.forum_outlined,
                size: 54,
                color: theme.colorScheme.primary.withValues(alpha: 0.55),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Pick a conversation',
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.82),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'New chats will open here with the full message history, customer context, and reply box ready.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                height: 1.5,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.48),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
