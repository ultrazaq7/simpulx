// ============================================================
// Chat Shell Page - Main CRM View with Responsive Layout
// ============================================================
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:simpulx/core/widgets/responsive_layout.dart';
import 'package:simpulx/features/chat/presentation/pages/chat_detail_page.dart';
import 'package:simpulx/features/chat/presentation/widgets/chat_details_panel.dart';
import 'package:simpulx/features/chat/presentation/widgets/conversation_list_widget.dart';

class ChatShellPage extends StatefulWidget {
  final String? selectedConversationId;

  const ChatShellPage({
    super.key,
    this.selectedConversationId,
  });

  @override
  State<ChatShellPage> createState() => _ChatShellPageState();
}

class _ChatShellPageState extends State<ChatShellPage> {
  bool _showFilterPanel = false;
  bool _showDetailsPanel = false;

  void _toggleFilterPanel() {
    setState(() => _showFilterPanel = !_showFilterPanel);
  }

  void _toggleDetailsPanel() {
    setState(() => _showDetailsPanel = !_showDetailsPanel);
  }

  @override
  void didUpdateWidget(covariant ChatShellPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedConversationId != widget.selectedConversationId) {
      _showDetailsPanel = false;
    }
  }

  void _showMobileDetailsPanel(String conversationId) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (_, scrollController) => ChatDetailsPanel(
          conversationId: conversationId,
          onClose: () => Navigator.pop(ctx),
          scrollController: scrollController,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isMobile = ResponsiveLayout.isMobile(context);
    final isDesktop = ResponsiveLayout.isDesktop(context);
    final selectedId = widget.selectedConversationId;
    final showList = !isMobile || selectedId == null;

    return PopScope(
      canPop: selectedId == null,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && selectedId != null) {
          context.go('/chat');
        }
      },
      child: ResponsiveLayout(
      conversationListWidth: isDesktop && _showFilterPanel ? 672 : 352,
      showConversationList: showList,
      conversationList: ConversationListWidget(
        selectedId: selectedId,
        showFilterPanel: _showFilterPanel,
        onToggleFilterPanel: _toggleFilterPanel,
        onConversationSelected: (id) => context.go('/chat/$id'),
      ),
      activeChat: selectedId == null
          ? null
          : ChatDetailPage(
              conversationId: selectedId,
              onBack: () => context.go('/chat'),
              isDetailsOpen: _showDetailsPanel,
              onToggleDetails: isDesktop
                  ? _toggleDetailsPanel
                  : () => _showMobileDetailsPanel(selectedId),
            ),
      showInfoPanel: isDesktop && selectedId != null && _showDetailsPanel,
      infoPanel: selectedId == null
          ? null
          : ChatDetailsPanel(
              conversationId: selectedId,
              onClose: _toggleDetailsPanel,
            ),
    ),
    );
  }
}
