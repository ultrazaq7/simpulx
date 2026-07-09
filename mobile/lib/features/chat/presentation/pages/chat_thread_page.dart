import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:url_launcher/url_launcher.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/i18n/i18n.dart';
import '../../../../core/utils/haptics.dart';
import '../../../../core/utils/time_format.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_skeleton.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../calls/presentation/call_controller.dart';
import '../../domain/entities/conversation.dart';
import '../../domain/entities/message.dart';
import '../../domain/repositories/chat_repository.dart';
import '../controllers/chat_providers.dart';
import '../controllers/chat_thread_controller.dart';
import '../controllers/conversation_list_controller.dart';
import '../widgets/conversation_actions_sheet.dart';
import '../widgets/message_bubble.dart';
import '../widgets/message_composer.dart';
import '../widgets/message_search_delegate.dart';
import '../widgets/template_picker_sheet.dart';
import 'custom_camera_page.dart';

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

class _ChatThreadPageState extends ConsumerState<ChatThreadPage>
    with WidgetsBindingObserver {
  final _scroll = ScrollController();
  int _lastCount = 0;
  bool _didInitialScroll = false;
  bool _showJump = false;
  double _lastBottomInset = 0;

  /// Look up this conversation from the live inbox list (used when opened
  /// without a route `extra`, e.g. from a push notification or contact Chat).
  Conversation? _liveConversation() {
    final list = ref.watch(conversationListProvider).value;
    if (list == null) return null;
    for (final c in list) {
      if (c.id == widget.conversationId) return c;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    super.dispose();
  }

  @override
  void didChangeMetrics() {
    // When the keyboard opens, scroll to bottom so the latest message stays
    // visible. Use a small delay because viewInsets may not be final in the
    // first frame callback.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final bottomInset = MediaQuery.of(context).viewInsets.bottom;
      final keyboardOpened = bottomInset > _lastBottomInset;
      _lastBottomInset = bottomInset;
      if (keyboardOpened) {
        // Immediate jump + delayed jump to catch final layout
        _jumpToBottom();
        Future.delayed(const Duration(milliseconds: 200), () {
          if (mounted) _jumpToBottom();
        });
      }
    });
  }

  void _onScroll() {
    // Near the top -> load older history.
    if (_scroll.position.pixels <= 80) {
      ref
          .read(chatThreadControllerProvider(widget.conversationId))
          .loadOlder();
    }
    // Show a "jump to latest" button once the user scrolls up meaningfully.
    final show = _scroll.hasClients &&
        _scroll.position.pixels < _scroll.position.maxScrollExtent - 600;
    if (show != _showJump) setState(() => _showJump = show);
  }

  void _scrollToBottomAnimated() {
    if (!_scroll.hasClients) return;
    _scroll.animateTo(
      _scroll.position.maxScrollExtent,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOut,
    );
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
              title: Text('Call over WhatsApp'.tr(context)),
              subtitle: Text('In-app voice call'.tr(context)),
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
              title: Text('Phone dialer'.tr(context)),
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
      AppSnackbar.show(context, 'No phone number for this contact'.tr(context), isError: true);
      return;
    }
    final normalized = phone.startsWith('+') ? phone : '+$phone';
    final uri = Uri.parse('tel:$normalized');
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok) throw Exception('no dialer');
      unawaited(
        ref.read(chatRepositoryProvider).trackCall(widget.conversationId),
      );
    } catch (_) {
      if (context.mounted) {
        AppSnackbar.show(context, 'Could not open the dialer'.tr(context), isError: true);
      }
    }
  }

  Future<void> _attach() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: Text('Camera'.tr(context)),
              onTap: () => Navigator.of(context).pop('camera'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text('Media library'.tr(context)),
              onTap: () => Navigator.of(context).pop('gallery'),
            ),
            ListTile(
              leading: const Icon(Icons.insert_drive_file_outlined),
              title: Text('Document'.tr(context)),
              onTap: () => Navigator.of(context).pop('file'),
            ),
          ],
        ),
      ),
    );
    if (choice == null) return;
    final ctrl = ref.read(chatThreadControllerProvider(widget.conversationId));

    if (choice == 'camera') {
      await _openCustomCamera();
      return;
    }

    if (choice == 'file') {
      final result = await FilePicker.platform.pickFiles(type: FileType.any, allowMultiple: true);
      if (result != null && result.files.isNotEmpty) {
        for (final picked in result.files) {
          if (picked.path != null) {
            await ctrl.attachAndSend(picked.path!,
                filename: picked.name, previewType: MessageType.document);
          }
        }
      }
      return;
    }

    // gallery
    if (choice == 'gallery') {
      final files = await ImagePicker().pickMultipleMedia(imageQuality: 80, maxWidth: 1600);
      for (final file in files) {
        final isVideo = file.path.toLowerCase().endsWith('.mp4') || file.path.toLowerCase().endsWith('.mov');
        await ctrl.attachAndSend(file.path, filename: file.name, previewType: isVideo ? MessageType.video : MessageType.image);
      }
    }
  }

  Future<void> _openCustomCamera() async {
    final result = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(builder: (_) => const CustomCameraPage()),
    );
    if (result == null) return;

    if (result['gallery'] == true) {
      // Launch standard gallery instead (allow multiple)
      final files = await ImagePicker().pickMultipleMedia(imageQuality: 80, maxWidth: 1600);
      final ctrl = ref.read(chatThreadControllerProvider(widget.conversationId));
      for (final file in files) {
        final isVideo = file.path.toLowerCase().endsWith('.mp4') || file.path.toLowerCase().endsWith('.mov');
        await ctrl.attachAndSend(file.path, filename: file.name, previewType: isVideo ? MessageType.video : MessageType.image);
      }
      return;
    }

    final path = result['path'] as String?;
    final type = result['type'] as MessageType?;
    if (path != null && type != null) {
      final ctrl = ref.read(chatThreadControllerProvider(widget.conversationId));
      await ctrl.attachAndSend(path, filename: p.basename(path), previewType: type);
    }
  }

  bool get _nearBottom =>
      !_scroll.hasClients ||
      _scroll.position.pixels >= _scroll.position.maxScrollExtent - 120;

  void _jumpToBottom() {
    if (_scroll.hasClients) {
      _scroll.jumpTo(_scroll.position.maxScrollExtent);
    }
  }

  void _maybeAutoScroll(int count) {
    if (count == 0) return;
    final firstLoad = !_didInitialScroll;
    if (count == _lastCount && !firstLoad) return;
    final grew = count > _lastCount;
    _lastCount = count;
    _didInitialScroll = true;

    if (firstLoad) {
      // Land at the bottom (newest) on open. Multiple delayed jumps ensure
      // it sticks even after layout/images settle.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _jumpToBottom();
        Future.delayed(const Duration(milliseconds: 100), () {
          if (mounted) _jumpToBottom();
        });
        Future.delayed(const Duration(milliseconds: 350), () {
          if (mounted) _jumpToBottom();
        });
        Future.delayed(const Duration(milliseconds: 600), () {
          if (mounted) _jumpToBottom();
        });
      });
    } else if (grew && _nearBottom) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _jumpToBottom());
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller =
        ref.watch(chatThreadControllerProvider(widget.conversationId));

    // Prefer the conversation passed via route extra; otherwise look it up live
    // from the inbox list so opening from a notification or the contact's Chat
    // button still shows the name/phone and enables calling.
    Conversation? resolved = widget.conversation ?? _liveConversation();
    // Opened from a push notification / deep link before the inbox list synced
    // (or when the current inbox filter excludes this lead): fetch it by id so
    // the header shows the real contact instead of a blank/nameless placeholder.
    resolved ??=
        ref.watch(conversationByIdProvider(widget.conversationId)).asData?.value;
    final conversation = resolved ??
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
        conversation: conversation,
        onMore: () => showConversationActions(context, conversation),
        onSendTemplate: () =>
            showTemplatePicker(context, widget.conversationId),
        onCall: () => _showCallMenu(conversation),
        onSearch: () {
          showSearch(
            context: context,
            delegate: MessageSearchDelegate(ref, widget.conversationId),
          );
        },
      ),
      body: Column(
        children: [
          Expanded(
            child: ListenableBuilder(
              listenable: controller,
              builder: (context, _) {
                final s = controller.state;
                if (s.initialLoading && s.messages.isEmpty) {
                  return const MessageThreadSkeleton();
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
                      child: Text('No messages yet. Say hello!'.tr(context),
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                    ),
                  );
                }
                _maybeAutoScroll(s.messages.length);
                return Stack(
                  children: [
                    _MessageList(
                      scroll: _scroll,
                      messages: s.messages,
                      loadingMore: s.loadingMore,
                    ),
                    Positioned(
                      right: 12,
                      bottom: 12,
                      child: AnimatedSlide(
                        duration: const Duration(milliseconds: 200),
                        offset: _showJump ? Offset.zero : const Offset(0, 2),
                        child: AnimatedOpacity(
                          duration: const Duration(milliseconds: 200),
                          opacity: _showJump ? 1 : 0,
                          child: _JumpToBottomButton(
                            onTap: _scrollToBottomAnimated,
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
          // WhatsApp 24-hour customer-care window: once the last message is
          // older than 24h, only template messages may be sent (mirrors web).
          if (conversation.channel == 'whatsapp' &&
              conversation.lastMessageAt != null &&
              DateTime.now().difference(conversation.lastMessageAt!) >
                  const Duration(hours: 24))
            Container(
              width: double.infinity,
              color: AppColors.danger.withValues(alpha: 0.10),
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  const Icon(Icons.access_time_rounded,
                      size: 16, color: AppColors.danger),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text('24-hour window closed. Only template messages can be sent.'.tr(context),
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.danger),
                    ),
                  ),
                  TextButton(
                    onPressed: () =>
                        showTemplatePicker(context, widget.conversationId),
                    style: TextButton.styleFrom(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 8),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                    child: Text('Template'.tr(context),
                        style: TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ),
          MessageComposer(
            conversationId: widget.conversationId,
            onSend: (text) => ref
                .read(chatThreadControllerProvider(widget.conversationId))
                .send(text),
            onAttach: _attach,
            onCamera: _openCustomCamera,
            onSendVoice: (path) => ref
                .read(chatThreadControllerProvider(widget.conversationId))
                .attachAndSend(path, previewType: MessageType.audio),
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
            MessageBubble(message: message, allMessages: messages),
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

/// Floating "jump to latest" button shown when the user scrolls up.
class _JumpToBottomButton extends StatelessWidget {
  const _JumpToBottomButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 3,
      shape: const CircleBorder(),
      color: Theme.of(context).colorScheme.surface,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Icon(Icons.keyboard_arrow_down_rounded,
              color: AppColors.primary, size: 26),
        ),
      ),
    );
  }
}

class _ThreadAppBar extends StatelessWidget implements PreferredSizeWidget {
  const _ThreadAppBar({
    this.conversation,
    this.onMore,
    this.onSendTemplate,
    this.onCall,
    this.onSearch,
  });
  final Conversation? conversation;
  final VoidCallback? onMore;
  final VoidCallback? onSendTemplate;
  final VoidCallback? onCall;
  final VoidCallback? onSearch;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final c = conversation;
    final title = c?.displayName ?? 'Conversation';
    final theme = Theme.of(context);
    return AppBar(
      titleSpacing: 0,
      shape: Border(
        bottom: BorderSide(
          color: theme.brightness == Brightness.dark 
              ? AppColors.darkBorder 
              : AppColors.border,
        ),
      ),
      title: GestureDetector(
        onTap: () {
          if (c != null && c.contactId.isNotEmpty) {
            context.push('/contacts/${c.contactId}');
          }
        },
        child: Row(
          children: [
            CircleAvatar(
              radius: 17,
              backgroundColor: AppColors.avatarColor(title),
              child: Text(
                _initials(title),
                style: const TextStyle(
                  color: Colors.white,
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
                  if (c != null && c.contactPhone.isNotEmpty)
                    Row(
                      children: [
                        Text(
                          c.contactPhone,
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.textSecondary),
                        ),
                        const SizedBox(width: 4),
                        GestureDetector(
                          onTap: () {
                            Clipboard.setData(ClipboardData(text: c.contactPhone));
                            AppSnackbar.show(context, 'Phone number copied'.tr(context));
                          },
                          child: const Icon(Icons.copy_rounded, size: 14, color: AppColors.textSecondary),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
      actions: [
        IconButton(
          onPressed: onCall,
          icon: const Icon(Icons.call_rounded),
          tooltip: 'Call',
        ),
        IconButton(
          onPressed: onSearch,
          icon: const Icon(Icons.search_rounded),
          tooltip: 'Search messages',
        ),
        const SizedBox(width: 4),
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
