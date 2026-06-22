import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/utils/time_format.dart';
import '../../../calls/presentation/call_controller.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_loader.dart';
import '../../domain/entities/conversation.dart';
import '../../domain/entities/message.dart';
import '../controllers/chat_providers.dart';
import '../controllers/chat_thread_controller.dart';
import '../widgets/conversation_actions_sheet.dart';
import '../widgets/lead_summary_sheet.dart';
import '../widgets/message_bubble.dart';
import '../widgets/message_composer.dart';
import '../widgets/quick_replies_sheet.dart';

/// Full-screen conversation thread (no bottom nav). Optimistic send + realtime
/// append; scroll up to load older history.
class ChatThreadPage extends ConsumerStatefulWidget {
  const ChatThreadPage({
    super.key,
    required this.conversationId,
    this.conversation,
  });

  final String conversationId;
  final Conversation? conversation;

  @override
  ConsumerState<ChatThreadPage> createState() => _ChatThreadPageState();
}

class _ChatThreadPageState extends ConsumerState<ChatThreadPage> {
  final _scroll = ScrollController();
  int _lastCount = 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    // Near the top -> load older history.
    if (_scroll.position.pixels <= 80) {
      ref
          .read(chatThreadControllerProvider(widget.conversationId))
          .loadOlder();
    }
  }

  void _showCallMenu(Conversation conv) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.wifi_calling_3_rounded,
                  color: AppColors.whatsapp),
              title: const Text('Call over WhatsApp'),
              subtitle: const Text('In-app voice call'),
              onTap: () {
                Navigator.of(sheetContext).pop();
                ref.read(callControllerProvider.notifier).startOutbound(
                      conversationId: widget.conversationId,
                      contactName: conv.displayName,
                      contactPhone: conv.contactPhone,
                    );
              },
            ),
            ListTile(
              leading: const Icon(Icons.call_outlined),
              title: const Text('Phone dialer'),
              onTap: () {
                Navigator.of(sheetContext).pop();
                _call(conv.contactPhone);
              },
            ),
          ],
        ),
      ),
    );
  }

  /// Call MVP: redirect to the dialer, then log the attempt (call tracking).
  Future<void> _call(String phone) async {
    final messenger = ScaffoldMessenger.of(context);
    if (phone.isEmpty) {
      messenger.showSnackBar(
        const SnackBar(content: Text('No phone number for this contact')),
      );
      return;
    }
    final normalized = phone.startsWith('+') ? phone : '+$phone';
    final uri = Uri.parse('tel:$normalized');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
      // Best-effort: record the call attempt for analytics/SLA.
      unawaited(
        ref.read(chatRepositoryProvider).trackCall(widget.conversationId),
      );
    } else {
      messenger.showSnackBar(
        const SnackBar(content: Text('Could not open the dialer')),
      );
    }
  }

  Future<void> _attach() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Camera'),
              onTap: () => Navigator.of(context).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Photo library'),
              onTap: () => Navigator.of(context).pop(ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;
    final file = await ImagePicker()
        .pickImage(source: source, imageQuality: 80, maxWidth: 1600);
    if (file == null) return;
    await ref
        .read(chatThreadControllerProvider(widget.conversationId))
        .attachAndSend(file.path, filename: file.name);
  }

  bool get _nearBottom =>
      !_scroll.hasClients ||
      _scroll.position.pixels >= _scroll.position.maxScrollExtent - 120;

  void _maybeAutoScroll(int count) {
    if (count == _lastCount) return;
    final grew = count > _lastCount;
    _lastCount = count;
    if (!grew) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients && _nearBottom) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller =
        ref.watch(chatThreadControllerProvider(widget.conversationId));

    final conversation = widget.conversation ??
        Conversation(
          id: widget.conversationId,
          status: 'open',
          channel: '',
          contactId: '',
          contactName: '',
          contactPhone: '',
          unreadCount: 0,
        );

    return Scaffold(
      appBar: _ThreadAppBar(
        conversation: widget.conversation,
        onMore: () => showConversationActions(context, conversation),
        onSummarize: () => showLeadSummary(context, widget.conversationId),
        onCall: () => _showCallMenu(conversation),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListenableBuilder(
              listenable: controller,
              builder: (context, _) {
                final s = controller.state;
                if (s.initialLoading && s.messages.isEmpty) {
                  return const AppLoader();
                }
                if (s.error != null && s.messages.isEmpty) {
                  return AppErrorView(
                    failure: s.error,
                    onRetry: controller.load,
                  );
                }
                if (s.isEmpty) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text(
                        'No messages yet. Say hello!',
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                    ),
                  );
                }
                _maybeAutoScroll(s.messages.length);
                return _MessageList(
                  scroll: _scroll,
                  messages: s.messages,
                  loadingMore: s.loadingMore,
                );
              },
            ),
          ),
          MessageComposer(
            onSend: (text) => controller.send(text),
            onPickQuickReply: () => showQuickRepliesSheet(context),
            onAttach: _attach,
            onSuggestReply: () => ref
                .read(chatRepositoryProvider)
                .streamDraftReply(widget.conversationId),
            onSendVoice: (path) => controller.attachAndSend(
              path,
              filename: 'voice.m4a',
              previewType: MessageType.audio,
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageList extends StatelessWidget {
  const _MessageList({
    required this.scroll,
    required this.messages,
    required this.loadingMore,
  });

  final ScrollController scroll;
  final List<Message> messages;
  final bool loadingMore;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      controller: scroll,
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: messages.length + (loadingMore ? 1 : 0),
      itemBuilder: (context, index) {
        if (loadingMore && index == 0) {
          return const Padding(
            padding: EdgeInsets.all(12),
            child: Center(
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        }
        final i = index - (loadingMore ? 1 : 0);
        final message = messages[i];
        final showDay = i == 0 ||
            !_sameDay(messages[i - 1].createdAt, message.createdAt);
        return Column(
          children: [
            if (showDay) _DaySeparator(date: message.createdAt),
            MessageBubble(message: message),
          ],
        );
      },
    );
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _DaySeparator extends StatelessWidget {
  const _DaySeparator({required this.date});
  final DateTime date;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.surfaceAlt,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            formatDayLabel(date),
            style: const TextStyle(
              fontSize: 11.5,
              color: AppColors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

class _ThreadAppBar extends StatelessWidget implements PreferredSizeWidget {
  const _ThreadAppBar({
    this.conversation,
    this.onMore,
    this.onSummarize,
    this.onCall,
  });
  final Conversation? conversation;
  final VoidCallback? onMore;
  final VoidCallback? onSummarize;
  final VoidCallback? onCall;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final c = conversation;
    final title = c?.displayName ?? 'Conversation';
    return AppBar(
      titleSpacing: 0,
      title: Row(
        children: [
          CircleAvatar(
            radius: 17,
            backgroundColor: AppColors.primary.withValues(alpha: 0.12),
            child: Text(
              _initials(title),
              style: const TextStyle(
                color: AppColors.primaryDark,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 15.5, fontWeight: FontWeight.w700),
                ),
                if (c != null)
                  Text(
                    c.contactPhone,
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.textSecondary),
                  ),
              ],
            ),
          ),
        ],
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.call_outlined),
          onPressed: onCall,
          tooltip: 'Call',
        ),
        IconButton(
          icon: const Icon(Icons.auto_awesome_outlined),
          onPressed: onSummarize,
          tooltip: 'Lead summary',
        ),
        IconButton(
          icon: const Icon(Icons.more_vert_rounded),
          onPressed: onMore,
          tooltip: 'Lead actions',
        ),
      ],
    );
  }

  String _initials(String name) {
    final parts =
        name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
        .toUpperCase();
  }
}
