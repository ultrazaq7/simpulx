import 'dart:async';


import 'package:simpulx/features/chat/domain/entities/chat_entities.dart';
import 'package:simpulx/features/chat/presentation/bloc/chat_bloc.dart';
import 'package:simpulx/features/chat/presentation/widgets/message_bubble.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/utils/avatar_colors.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';
import 'package:simpulx/features/chat/presentation/pages/file_reader.dart'
    as file_reader;
import 'package:simpulx/features/chat/presentation/pages/web_file_helpers.dart'
    as web_helpers;
import 'package:dio/dio.dart'
    show DioMediaType, FormData, MultipartFile, Options;
import 'package:emoji_picker_flutter/emoji_picker_flutter.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

class ChatDetailPage extends StatefulWidget {
  final String conversationId;
  final VoidCallback? onBack;
  final bool isDetailsOpen;
  final VoidCallback? onToggleDetails;

  const ChatDetailPage({
    super.key,
    required this.conversationId,
    this.onBack,
    this.isDetailsOpen = false,
    this.onToggleDetails,
  });

  @override
  State<ChatDetailPage> createState() => _ChatDetailPageState();
}

class _ChatDetailPageState extends State<ChatDetailPage> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  bool _showEmojiPicker = false;
  bool _showQuickReplies = false;

  // "/" shortcut suggestions
  List<Map<String, dynamic>> _quickReplyCache = [];
  bool _quickReplyCacheLoaded = false;
  final _shortcutSuggestions = ValueNotifier<List<Map<String, dynamic>>>([]);

  // Pending attachment preview
  _PickedAttachment? _pendingAttachment;
  bool _isUploading = false;

  // Voice recording
  AudioRecorder? _audioRecorder;
  bool _isRecording = false;
  bool _isPaused = false;
  Duration _recordingDuration = Duration.zero;
  Timer? _recordingTimer;

  // Clipboard paste listener
  void Function()? _pasteSub;

  @override
  void initState() {
    super.initState();
    _messageController.addListener(_onMessageChanged);
    _pasteSub = web_helpers.initPasteListener((name, bytes) {
      if (mounted) {
        setState(() {
          _pendingAttachment = _PickedAttachment(name: name, bytes: bytes);
        });
      }
    });
    context
        .read<ChatBloc>()
        .add(LoadMessagesEvent(conversationId: widget.conversationId));
    context
        .read<ConversationCubit>()
        .markConversationRead(widget.conversationId);
    // If conversations list is empty (e.g. page refresh), load them
    final cubit = context.read<ConversationCubit>();
    if (cubit.state.conversations.isEmpty) {
      cubit.loadConversations();
    }
  }

  @override
  void didUpdateWidget(covariant ChatDetailPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.conversationId != widget.conversationId) {
      context
          .read<ChatBloc>()
          .add(LoadMessagesEvent(conversationId: widget.conversationId));
      context
          .read<ConversationCubit>()
          .markConversationRead(widget.conversationId);
    }
  }

  @override
  void dispose() {
    _pasteSub?.call();
    _recordingTimer?.cancel();
    _audioRecorder?.dispose();
    _messageController.removeListener(_onMessageChanged);
    _messageController.dispose();
    _scrollController.dispose();
    _shortcutSuggestions.dispose();
    super.dispose();
  }

  // ════════════════════════════════════════════
  // Voice Recording
  // ════════════════════════════════════════════

  Future<void> _startRecording() async {
    try {
      // Create fresh recorder each time to avoid stale state
      _audioRecorder?.dispose();
      _audioRecorder = AudioRecorder();

      // Request microphone permission
      final hasPermission = await _audioRecorder!.hasPermission();
      if (!hasPermission) {
        if (mounted) {
          AppSnackbar.error(context,
              'Microphone access is required. Please allow microphone permission in your browser/device settings.');
        }
        return;
      }

      // Check encoder support - prefer Opus, fall back to AAC (mobile), then WAV
      AudioEncoder encoder = AudioEncoder.opus;
      String ext = 'ogg';
      if (!await _audioRecorder!.isEncoderSupported(AudioEncoder.opus)) {
        if (await _audioRecorder!.isEncoderSupported(AudioEncoder.aacLc)) {
          encoder = AudioEncoder.aacLc;
          ext = 'm4a';
        } else {
          encoder = AudioEncoder.wav;
          ext = 'wav';
        }
      }

      final config = RecordConfig(
        encoder: encoder,
        sampleRate: 16000,
        numChannels: 1,
        bitRate: 32000,
      );

      // Web returns a blob URL from `path: ''`; mobile/desktop need a real
      // writable path - without one, recording silently fails on Android.
      String recordPath = '';
      if (!kIsWeb) {
        final dir = await getTemporaryDirectory();
        recordPath =
            '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.$ext';
      }

      await _audioRecorder!.start(config, path: recordPath);

      if (!mounted) return;
      setState(() {
        _isRecording = true;
        _isPaused = false;
        _recordingDuration = Duration.zero;
      });

      _recordingTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) {
          setState(() => _recordingDuration += const Duration(seconds: 1));
        }
      });
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, 'Could not start recording: $e');
      }
    }
  }

  Future<void> _stopAndSendRecording() async {
    _recordingTimer?.cancel();
    _recordingTimer = null;

    if (_audioRecorder == null) return;

    try {
      final path = await _audioRecorder!.stop();
      if (path == null || path.isEmpty) {
        if (mounted) {
          setState(() => _isRecording = false);
          AppSnackbar.error(context, 'Recording failed - no data');
        }
        return;
      }

      if (!mounted) return;
      setState(() {
        _isRecording = false;
        _isUploading = true;
      });

      Uint8List bytes;
      String filename;

      if (kIsWeb) {
        // On web, `path` is a blob URL - fetch it
        bytes = await _fetchBlobUrl(path);
        filename = 'voice_${DateTime.now().millisecondsSinceEpoch}.ogg';
      } else {
        // On mobile/desktop, `path` is a file system path
        final file = await _readFileBytes(path);
        if (file == null) {
          if (mounted) {
            setState(() => _isUploading = false);
            AppSnackbar.error(context, 'Could not read recording file');
          }
          return;
        }
        bytes = file;
        final ext = path.split('.').last;
        filename = 'voice_${DateTime.now().millisecondsSinceEpoch}.$ext';
      }

      await _uploadAttachment(
        conversationId: widget.conversationId,
        filename: filename,
        bytes: bytes,
      );

      if (mounted) {
        setState(() => _isUploading = false);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isRecording = false;
          _isUploading = false;
        });
        AppSnackbar.error(context, 'Failed to send voice message: $e');
      }
    }
  }

  void _cancelRecording() async {
    _recordingTimer?.cancel();
    _recordingTimer = null;
    try {
      await _audioRecorder?.cancel();
    } catch (_) {
      try {
        await _audioRecorder?.stop();
      } catch (_) {}
    }
    if (mounted) {
      setState(() {
        _isRecording = false;
        _isPaused = false;
        _recordingDuration = Duration.zero;
      });
    }
  }

  Future<void> _togglePauseRecording() async {
    if (_audioRecorder == null) return;
    try {
      if (_isPaused) {
        await _audioRecorder!.resume();
        _recordingTimer = Timer.periodic(const Duration(seconds: 1), (_) {
          if (mounted) {
            setState(() => _recordingDuration += const Duration(seconds: 1));
          }
        });
      } else {
        await _audioRecorder!.pause();
        _recordingTimer?.cancel();
        _recordingTimer = null;
      }
      if (mounted) setState(() => _isPaused = !_isPaused);
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, 'Pause/resume failed: $e');
      }
    }
  }

  Future<Uint8List> _fetchBlobUrl(String blobUrl) async {
    // Use the web-specific XMLHttpRequest helper (not DioClient which has baseUrl)
    final bytes = await web_helpers.fetchBlobBytes(blobUrl);
    if (bytes == null || bytes.isEmpty) {
      throw Exception('Failed to fetch blob data from recording');
    }
    return bytes;
  }

  Future<Uint8List?> _readFileBytes(String path) async {
    try {
      return await file_reader.readFileBytes(path);
    } catch (_) {
      return null;
    }
  }

  String _formatRecordingDuration(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  Future<void> _ensureQuickReplyCache() async {
    if (_quickReplyCacheLoaded) return;
    _quickReplyCacheLoaded = true;
    try {
      final dioClient = di.sl<DioClient>();
      final resp = await dioClient.dio.get(ApiConstants.quickReplies);
      final data = resp.data;
      final list = data is List ? data : (data['data'] ?? []) as List;
      _quickReplyCache = list.cast<Map<String, dynamic>>();
    } catch (_) {}
  }

  void _onMessageChanged() {
    final text = _messageController.text;
    if (text.startsWith('/') && text.length > 1 && !text.contains(' ')) {
      _ensureQuickReplyCache().then((_) {
        if (!mounted) return;
        final query = text.substring(1).toLowerCase();
        final matches = _quickReplyCache.where((r) {
          final shortcut = (r['shortcut'] ?? '').toString().toLowerCase();
          if (shortcut.isEmpty) return false;
          final sc =
              shortcut.startsWith('/') ? shortcut.substring(1) : shortcut;
          return sc.startsWith(query);
        }).toList();
        _shortcutSuggestions.value = matches;
      });
    } else {
      if (_shortcutSuggestions.value.isNotEmpty) {
        _shortcutSuggestions.value = [];
      }
    }
  }

  void _selectShortcutReply(Map<String, dynamic> reply) {
    final content = reply['content'] as String? ?? '';
    _shortcutSuggestions.value = [];
    _messageController.text = content;
    _messageController.selection = TextSelection.fromPosition(
      TextPosition(offset: content.length),
    );
  }

  void _sendMessage() {
    // If there's a pending attachment, send it
    if (_pendingAttachment != null) {
      _sendPendingAttachment();
      return;
    }
    final text = _messageController.text.trim();
    if (text.isEmpty) return;
    debugPrint('[ChatDetail] Sending message: "$text"');
    context.read<ChatBloc>().add(
          SendMessageEvent(
              conversationId: widget.conversationId, content: text),
        );
    _messageController.clear();
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  Future<void> _showTemplatePicker() async {
    final cubitState = context.read<ConversationCubit>().state;
    final matches =
        cubitState.conversations.where((c) => c.id == widget.conversationId);
    if (matches.isEmpty) return;
    final conversation = matches.first;
    final channelId = conversation.whatsappChannelId;
    if (channelId == null || channelId.isEmpty) {
      AppSnackbar.error(
          context, 'No WhatsApp channel linked to this conversation');
      return;
    }

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => _TemplatePickerDialog(channelId: channelId),
    );

    if (result != null && mounted) {
      context.read<ChatBloc>().add(
            SendTemplateEvent(
              conversationId: widget.conversationId,
              templateId: result['templateId'] as String,
              variables: result['variables'] as Map<String, String>?,
            ),
          );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final conversation = _selectedConversation(context);

    return DecoratedBox(
      decoration: BoxDecoration(color: theme.scaffoldBackgroundColor),
      child: Column(
        children: [
          _buildChatHeader(context, conversation),
          Expanded(
            child: BlocConsumer<ChatBloc, ChatState>(
              listener: (context, state) {
                if (!state.isLoading && state.messages.isNotEmpty) {
                  WidgetsBinding.instance
                      .addPostFrameCallback((_) => _scrollToBottom());
                }
                if (state.error != null && !state.isLoading) {
                  AppSnackbar.error(context, state.error!);
                }
              },
              builder: (context, state) {
                if (state.isLoading) {
                  return const _ChatStateMessage(
                    icon: Icons.sync_rounded,
                    title: 'Loading messages',
                    message: 'Pulling the latest thread history.',
                    showSpinner: true,
                  );
                }

                if (state.error != null && state.messages.isEmpty) {
                  return _ChatStateMessage(
                    icon: Icons.error_outline_rounded,
                    title: 'Messages did not load',
                    message: state.error!,
                  );
                }

                if (state.messages.isEmpty) {
                  return const _ChatStateMessage(
                    icon: Icons.chat_bubble_outline_rounded,
                    title: 'No messages yet',
                    message: 'Send the first reply when you are ready.',
                  );
                }

                return ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(24, 18, 24, 20),
                  itemCount: state.messages.length,
                  itemBuilder: (context, index) {
                    final message = state.messages[index];
                    final showDate = index == 0 ||
                        message.createdAt.day !=
                            state.messages[index - 1].createdAt.day ||
                        message.createdAt.month !=
                            state.messages[index - 1].createdAt.month ||
                        message.createdAt.year !=
                            state.messages[index - 1].createdAt.year;

                    return Column(
                      children: [
                        if (showDate)
                          _buildDateDivider(context, message.createdAt),
                        MessageBubble(
                          message: message,
                          allMessages: state.messages,
                        ),
                      ],
                    );
                  },
                );
              },
            ),
          ),
          _buildMessageInput(context),
        ],
      ),
    );
  }

  Widget _buildChatHeader(
    BuildContext context,
    ConversationEntity? conversation,
  ) {
    final theme = Theme.of(context);
    final contactName = conversation?.contact?.displayName ?? 'Conversation';
    final contact = conversation?.contact;
    final phoneId = contact?.phone?.trim().isNotEmpty == true
        ? contact!.phone!
        : contact?.whatsappId?.trim().isNotEmpty == true
            ? contact!.whatsappId!
            : null;
    final initial = contactName.isNotEmpty ? contactName[0].toUpperCase() : '?';
    final showBack = widget.onBack != null;
    final showBackLabel = MediaQuery.of(context).size.width >= 768;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          bottom: BorderSide(color: theme.dividerColor.withValues(alpha: 0.8)),
        ),
      ),
      child: Row(
        children: [
          if (showBack) ...[
            if (showBackLabel)
              _HeaderIconButton(
                icon: Icons.close_rounded,
                tooltip: 'Close conversation',
                onPressed: widget.onBack!,
              )
            else
              _HeaderIconButton(
                icon: Icons.arrow_back_rounded,
                tooltip: 'All chats',
                onPressed: widget.onBack!,
              ),
            const SizedBox(width: 10),
          ],
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: AvatarColors.getBackgroundColor(contactName),
              borderRadius: BorderRadius.circular(7),
            ),
            alignment: Alignment.center,
            child: Text(
              initial,
              style: TextStyle(
                color: AvatarColors.getColor(contactName),
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  contactName,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                if (phoneId != null) ...[
                  const SizedBox(height: 2),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          phoneId,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.45),
                            fontWeight: FontWeight.w500,
                            fontSize: 12,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 4),
                      InkWell(
                        onTap: () {
                          Clipboard.setData(ClipboardData(text: phoneId));
                          AppSnackbar.success(context, 'Phone copied');
                        },
                        borderRadius: BorderRadius.circular(4),
                        child: Padding(
                          padding: const EdgeInsets.all(2),
                          child: Icon(
                            Icons.copy_rounded,
                            size: 13,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.35),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          if (conversation != null) ...[
            _ConversationStatusButton(conversation: conversation),
          ],
          if (widget.onToggleDetails != null) ...[
            const SizedBox(width: 8),
            IconButton(
              onPressed: widget.onToggleDetails,
              icon: Icon(
                widget.isDetailsOpen
                    ? Icons.info_rounded
                    : Icons.info_outline_rounded,
                size: 20,
              ),
              tooltip: widget.isDetailsOpen ? 'Hide details' : 'Show details',
              style: IconButton.styleFrom(
                backgroundColor: widget.isDetailsOpen
                    ? Theme.of(context)
                        .colorScheme
                        .primary
                        .withValues(alpha: 0.10)
                    : null,
              ),
            ),
          ],
        ],
      ),
    );
  }

  ConversationEntity? _selectedConversation(BuildContext context) {
    final conversationState = context.watch<ConversationCubit>().state;
    final matches = conversationState.conversations
        .where((item) => item.id == widget.conversationId);
    return matches.isEmpty ? null : matches.first;
  }

  Widget _buildDateDivider(BuildContext context, DateTime date) {
    final theme = Theme.of(context);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final messageDay = DateTime(date.year, date.month, date.day);
    String label;

    if (messageDay == today) {
      label = 'Today';
    } else if (messageDay == today.subtract(const Duration(days: 1))) {
      label = 'Yesterday';
    } else {
      label = '${date.day}/${date.month}/${date.year}';
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        children: [
          Expanded(
            child: Divider(color: theme.dividerColor.withValues(alpha: 0.7)),
          ),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 12),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: theme.dividerColor.withValues(alpha: 0.8),
              ),
            ),
            child: Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.48),
              ),
            ),
          ),
          Expanded(
            child: Divider(color: theme.dividerColor.withValues(alpha: 0.7)),
          ),
        ],
      ),
    );
  }

  Widget _buildRecordingUI(ThemeData theme) {
    const recordColor = Color(0xFFEF4444);
    final pauseColor = theme.colorScheme.onSurface.withValues(alpha: 0.7);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      child: Row(
        children: [
          // Cancel / Delete recording
          IconButton(
            onPressed: _cancelRecording,
            icon: const Icon(Icons.delete_outline_rounded, size: 22),
            tooltip: 'Cancel recording',
            style: IconButton.styleFrom(
              foregroundColor:
                  theme.colorScheme.onSurface.withValues(alpha: 0.6),
            ),
            constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
            padding: EdgeInsets.zero,
          ),
          const SizedBox(width: 4),
          // Pulsing red indicator + timer
          Expanded(
            child: Row(
              children: [
                // Animated pulsing dot (freezes when paused)
                if (!_isPaused)
                  const _PulsingDot(color: recordColor)
                else
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: recordColor.withValues(alpha: 0.5),
                      shape: BoxShape.circle,
                    ),
                  ),
                const SizedBox(width: 10),
                Text(
                  _isPaused ? 'Paused' : 'Recording',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: _isPaused ? pauseColor : recordColor,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  _formatRecordingDuration(_recordingDuration),
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                    fontWeight: FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
          // Pause / Resume
          IconButton(
            onPressed: _togglePauseRecording,
            icon: Icon(
              _isPaused ? Icons.play_arrow_rounded : Icons.pause_rounded,
              size: 24,
            ),
            tooltip: _isPaused ? 'Resume' : 'Pause',
            style: IconButton.styleFrom(
              foregroundColor: pauseColor,
            ),
            constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
            padding: EdgeInsets.zero,
          ),
          const SizedBox(width: 4),
          // Send recording
          SizedBox(
            width: 40,
            height: 40,
            child: IconButton.filled(
              onPressed: _isUploading ? null : _stopAndSendRecording,
              icon: _isUploading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.send_rounded, size: 20),
              style: IconButton.styleFrom(
                backgroundColor: recordColor,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageInput(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Quick Replies panel
        if (_showQuickReplies)
          _QuickReplyPanel(
            onSelect: (content) {
              _messageController.text = content;
              _messageController.selection = TextSelection.fromPosition(
                TextPosition(offset: content.length),
              );
              setState(() => _showQuickReplies = false);
            },
            onClose: () {
              setState(() => _showQuickReplies = false);
              // Refresh cache in case new replies were created
              _quickReplyCacheLoaded = false;
            },
          ),
        // "/" shortcut suggestions (uses ValueListenableBuilder to avoid TextField rebuild)
        ValueListenableBuilder<List<Map<String, dynamic>>>(
          valueListenable: _shortcutSuggestions,
          builder: (context, suggestions, _) {
            if (suggestions.isEmpty) return const SizedBox.shrink();
            return Container(
              constraints: const BoxConstraints(maxHeight: 200),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                border: Border(
                  top: BorderSide(
                      color: theme.dividerColor.withValues(alpha: 0.5)),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.08),
                    blurRadius: 8,
                    offset: const Offset(0, -2),
                  ),
                ],
              ),
              child: ListView.separated(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(vertical: 4),
                itemCount: suggestions.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (_, i) {
                  final r = suggestions[i];
                  final shortcut = r['shortcut'] as String? ?? '';
                  return ListTile(
                    dense: true,
                    leading: Icon(Icons.bolt_rounded,
                        size: 18, color: theme.colorScheme.primary),
                    title: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primaryContainer,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(shortcut,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: theme.colorScheme.onPrimaryContainer,
                              )),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(r['title'] ?? '',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w600, fontSize: 13),
                              overflow: TextOverflow.ellipsis),
                        ),
                      ],
                    ),
                    subtitle: Text(
                      r['content'] ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.6),
                      ),
                    ),
                    onTap: () => _selectShortcutReply(r),
                  );
                },
              ),
            );
          },
        ),
        // Attachment preview bar
        if (_pendingAttachment != null) _buildAttachmentPreview(theme),
        Container(
          margin: const EdgeInsets.fromLTRB(10, 6, 10, 8),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: theme.dividerColor.withValues(alpha: 0.7),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 6,
                offset: const Offset(0, -1),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: _isRecording
                ? _buildRecordingUI(theme)
                : BlocBuilder<ChatBloc, ChatState>(
                    builder: (context, state) {
                      return Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Text field area
                          Focus(
                            onKeyEvent: (node, event) {
                              if (event is KeyDownEvent &&
                                  event.logicalKey ==
                                      LogicalKeyboardKey.enter &&
                                  !HardwareKeyboard.instance.isShiftPressed) {
                                _sendMessage();
                                return KeyEventResult.handled;
                              }
                              return KeyEventResult.ignored;
                            },
                            child: TextField(
                              controller: _messageController,
                              onTap: () {
                                if (_showEmojiPicker || _showQuickReplies) {
                                  setState(() {
                                    _showEmojiPicker = false;
                                    _showQuickReplies = false;
                                  });
                                }
                              },
                              minLines: 1,
                              maxLines: 4,
                              textInputAction: TextInputAction.newline,
                              decoration: InputDecoration(
                                hintText: _pendingAttachment != null
                                    ? 'Add a caption (optional)...'
                                    : 'Type a message...',
                                hintStyle: TextStyle(
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.38),
                                ),
                                filled: false,
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 12,
                                ),
                                border: InputBorder.none,
                                enabledBorder: InputBorder.none,
                                focusedBorder: InputBorder.none,
                              ),
                            ),
                          ),
                          // Divider
                          Divider(
                            height: 1,
                            color: theme.dividerColor.withValues(alpha: 0.4),
                          ),
                          // Action buttons row
                          Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 4),
                            child: Row(
                              children: [
                                // Emoji toggle
                                _InputActionButton(
                                  icon: _showEmojiPicker
                                      ? Icons.keyboard_rounded
                                      : Icons.emoji_emotions_outlined,
                                  tooltip:
                                      _showEmojiPicker ? 'Keyboard' : 'Emoji',
                                  isActive: _showEmojiPicker,
                                  onPressed: state.isSending
                                      ? null
                                      : () => setState(() {
                                            _showEmojiPicker =
                                                !_showEmojiPicker;
                                            _showQuickReplies = false;
                                          }),
                                ),
                                // Attachment
                                _InputActionButton(
                                  icon: Icons.attach_file_rounded,
                                  tooltip: 'Attach file',
                                  onPressed:
                                      state.isSending ? null : _pickAndSendFile,
                                ),
                                // More actions (Quick Reply + Template)
                                _MoreActionsMenu(
                                  isSending: state.isSending,
                                  onQuickReply: () => setState(() {
                                    _showQuickReplies = !_showQuickReplies;
                                    _showEmojiPicker = false;
                                  }),
                                  onTemplate: _showTemplatePicker,
                                ),
                                const Spacer(),
                                // Mic button
                                _InputActionButton(
                                  icon: Icons.mic_rounded,
                                  tooltip: 'Record voice message',
                                  onPressed: (state.isSending || _isUploading)
                                      ? null
                                      : _startRecording,
                                ),
                                const SizedBox(width: 4),
                                // Send button
                                SizedBox(
                                  width: 36,
                                  height: 36,
                                  child: IconButton.filled(
                                    onPressed: (state.isSending || _isUploading)
                                        ? null
                                        : _sendMessage,
                                    icon: (state.isSending || _isUploading)
                                        ? const SizedBox(
                                            width: 16,
                                            height: 16,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                              color: Colors.white,
                                            ),
                                          )
                                        : const Icon(Icons.send_rounded,
                                            size: 18),
                                    style: IconButton.styleFrom(
                                      backgroundColor:
                                          theme.colorScheme.primary,
                                      foregroundColor: Colors.white,
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      );
                    },
                  ),
          ),
        ),
        // Emoji picker panel
        if (_showEmojiPicker)
          SizedBox(
            height: 360,
            child: EmojiPicker(
              onEmojiSelected: (category, emoji) {
                final text = _messageController.text;
                final sel = _messageController.selection;
                final start = sel.start < 0 ? text.length : sel.start;
                final end = sel.end < 0 ? text.length : sel.end;
                final newText = text.replaceRange(start, end, emoji.emoji);
                _messageController.text = newText;
                _messageController.selection = TextSelection.fromPosition(
                  TextPosition(offset: start + emoji.emoji.length),
                );
              },
              config: Config(
                height: 360,
                checkPlatformCompatibility: true,
                emojiViewConfig: EmojiViewConfig(
                  columns: 8,
                  emojiSizeMax: 28,
                  verticalSpacing: 4,
                  horizontalSpacing: 4,
                  backgroundColor: theme.colorScheme.surface,
                ),
                categoryViewConfig: CategoryViewConfig(
                  categoryIcons: const CategoryIcons(),
                  backgroundColor: theme.colorScheme.surface,
                  indicatorColor: theme.colorScheme.primary,
                  iconColorSelected: theme.colorScheme.primary,
                  iconColor: theme.colorScheme.onSurface.withValues(alpha: 0.4),
                  tabIndicatorAnimDuration: const Duration(milliseconds: 250),
                  tabBarHeight: 40,
                ),
                searchViewConfig: SearchViewConfig(
                  backgroundColor: theme.colorScheme.surface,
                  buttonIconColor: theme.colorScheme.primary,
                  hintText: 'Search',
                ),
                bottomActionBarConfig: const BottomActionBarConfig(
                  enabled: false,
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildAttachmentPreview(ThemeData theme) {
    final attachment = _pendingAttachment!;
    final ext = attachment.name.split('.').last.toLowerCase();
    final isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].contains(ext);
    final sizeKb = (attachment.bytes.length / 1024).toStringAsFixed(1);
    final sizeMb = (attachment.bytes.length / (1024 * 1024)).toStringAsFixed(1);
    final sizeLabel =
        attachment.bytes.length > 1024 * 1024 ? '$sizeMb MB' : '$sizeKb KB';

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          top: BorderSide(color: theme.dividerColor.withValues(alpha: 0.5)),
        ),
      ),
      child: Row(
        children: [
          // Preview thumbnail or icon
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: theme.colorScheme.primaryContainer.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(8),
            ),
            clipBehavior: Clip.antiAlias,
            child: isImage
                ? Image.memory(attachment.bytes, fit: BoxFit.cover)
                : Center(
                    child: Icon(
                      _fileIcon(ext),
                      size: 28,
                      color: theme.colorScheme.primary,
                    ),
                  ),
          ),
          const SizedBox(width: 12),
          // File name + size
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  attachment.name,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  sizeLabel,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                ),
              ],
            ),
          ),
          // Remove button
          if (!_isUploading)
            IconButton(
              onPressed: _clearPendingAttachment,
              icon: const Icon(Icons.close_rounded, size: 20),
              style: IconButton.styleFrom(
                foregroundColor:
                    theme.colorScheme.onSurface.withValues(alpha: 0.5),
              ),
              constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
              padding: EdgeInsets.zero,
              tooltip: 'Remove',
            ),
          if (_isUploading)
            const Padding(
              padding: EdgeInsets.all(8),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
        ],
      ),
    );
  }

  IconData _fileIcon(String ext) {
    switch (ext) {
      case 'pdf':
        return Icons.picture_as_pdf_rounded;
      case 'doc':
      case 'docx':
        return Icons.description_rounded;
      case 'xls':
      case 'xlsx':
        return Icons.table_chart_rounded;
      case 'mp4':
      case 'mov':
      case 'avi':
        return Icons.videocam_rounded;
      case 'mp3':
      case 'wav':
      case 'ogg':
        return Icons.audiotrack_rounded;
      case 'zip':
      case 'rar':
      case '7z':
        return Icons.folder_zip_rounded;
      default:
        return Icons.insert_drive_file_rounded;
    }
  }

  Future<void> _pickAndSendFile() async {
    try {
      _PickedAttachment? picked;
      if (kIsWeb) {
        picked = await _pickFileForWeb();
      } else {
        final result = await FilePicker.platform.pickFiles(
          type: FileType.any,
          withData: true,
          withReadStream: true,
        );
        if (result != null && result.files.isNotEmpty) {
          final file = result.files.first;
          Uint8List? bytes = file.bytes;
          if (bytes == null && file.readStream != null) {
            final chunks = <int>[];
            await for (final chunk in file.readStream!) {
              chunks.addAll(chunk);
            }
            bytes = Uint8List.fromList(chunks);
          }
          if (bytes != null) {
            picked = _PickedAttachment(name: file.name, bytes: bytes);
          }
        }
      }
      if (picked == null) return;
      setState(() => _pendingAttachment = picked);
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, 'Failed to pick file: $e');
      }
    }
  }

  void _clearPendingAttachment() {
    setState(() => _pendingAttachment = null);
  }

  Future<void> _sendPendingAttachment() async {
    final attachment = _pendingAttachment;
    if (attachment == null) return;
    setState(() => _isUploading = true);
    try {
      await _uploadAttachment(
        conversationId: widget.conversationId,
        filename: attachment.name,
        bytes: attachment.bytes,
        caption: _messageController.text.trim(),
      );
      if (mounted) {
        setState(() {
          _pendingAttachment = null;
          _isUploading = false;
        });
        _messageController.clear();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isUploading = false);
        AppSnackbar.error(context, 'Failed to send file: $e');
      }
    }
  }

  Future<_PickedAttachment?> _pickFileForWeb() async {
    final result = await web_helpers.pickFileForWeb();
    if (result == null) return null;
    return _PickedAttachment(name: result.name, bytes: result.bytes);
  }

  String _mimeFromFilename(String filename) {
    final ext = filename.split('.').last.toLowerCase();
    const mimeMap = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml',
      'tiff': 'image/tiff',
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
    };
    return mimeMap[ext] ?? 'application/octet-stream';
  }

  Future<void> _uploadAttachment({
    required String conversationId,
    required String filename,
    required Uint8List bytes,
    String? caption,
  }) async {
    final dioClient = di.sl<DioClient>();
    final mime = _mimeFromFilename(filename);
    final map = <String, dynamic>{
      'file': MultipartFile.fromBytes(
        bytes,
        filename: filename,
        contentType: DioMediaType.parse(mime),
      ),
    };
    if (caption != null && caption.isNotEmpty) {
      map['caption'] = caption;
    }
    final formData = FormData.fromMap(map);

    await dioClient.dio.post(
      '${ApiConstants.conversations}/$conversationId/media',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );

    if (!mounted) return;

    AppSnackbar.success(context, 'Attachment uploaded: $filename');
    context
        .read<ChatBloc>()
        .add(LoadMessagesEvent(conversationId: conversationId));
  }
}

class _PickedAttachment {
  final String name;
  final Uint8List bytes;

  const _PickedAttachment({required this.name, required this.bytes});
}

class _HeaderIconButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  const _HeaderIconButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            icon,
            size: 19,
            color: theme.colorScheme.onSurface.withValues(alpha: 0.58),
          ),
        ),
      ),
    );
  }
}

class _InputActionButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool isActive;

  const _InputActionButton({
    required this.icon,
    required this.tooltip,
    this.onPressed,
    this.isActive = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = isActive
        ? theme.colorScheme.primary
        : theme.colorScheme.onSurface.withValues(alpha: 0.52);

    return IconButton(
      onPressed: onPressed,
      icon: Icon(icon, size: 20),
      tooltip: tooltip,
      style: IconButton.styleFrom(
        foregroundColor: color,
        backgroundColor: isActive
            ? theme.colorScheme.primary.withValues(alpha: 0.10)
            : Colors.transparent,
      ),
      constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
      padding: EdgeInsets.zero,
    );
  }
}

class _PulsingDot extends StatefulWidget {
  final Color color;
  const _PulsingDot({required this.color});

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (_, __) {
        return Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color:
                widget.color.withValues(alpha: 0.4 + _controller.value * 0.6),
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: widget.color.withValues(alpha: _controller.value * 0.4),
                blurRadius: 6,
                spreadRadius: 1,
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ConversationStatusButton extends StatefulWidget {
  final ConversationEntity conversation;

  const _ConversationStatusButton({required this.conversation});

  @override
  State<_ConversationStatusButton> createState() =>
      _ConversationStatusButtonState();
}

class _ConversationStatusButtonState extends State<_ConversationStatusButton> {
  var _isSaving = false;

  Future<void> _changeStatus(String action) async {
    if (_isSaving) return;

    switch (action) {
      case 'open':
        if (widget.conversation.status == 'open') return;
        await _doUpdateStatus('open');
        break;
      case 'snooze':
        final snoozedUntil = await showDialog<DateTime>(
          context: context,
          builder: (ctx) => const _SnoozeDialog(),
        );
        if (snoozedUntil == null) return;
        await _doUpdateStatus(
          'pending',
          snoozedUntil: snoozedUntil.toUtc().toIso8601String(),
        );
        if (mounted) {
          AppSnackbar.success(context, 'Conversation snoozed');
        }
        return; // skip the generic snackbar
      case 'close':
        final stage = await showDialog<Map<String, dynamic>>(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => const _StagePickerDialog(
            status: 'closed',
            categoryFilter: {'won', 'lost'},
          ),
        );
        if (stage == null) return;
        await _doUpdateStatus(
          'closed',
          stageId: stage['id'] as String?,
          stageName: stage['name'] as String?,
          stageColor: stage['color'] as String?,
          stageCategory: stage['category'] as String?,
        );
        break;
    }
  }

  Future<void> _doUpdateStatus(
    String status, {
    String? stageId,
    String? stageName,
    String? stageColor,
    String? stageCategory,
    String? snoozedUntil,
  }) async {
    setState(() => _isSaving = true);
    final error =
        await context.read<ConversationCubit>().updateConversationStatus(
              conversationId: widget.conversation.id,
              status: status,
              stageId: stageId,
              stageName: stageName,
              stageColor: stageColor,
              stageCategory: stageCategory,
              snoozedUntil: snoozedUntil,
            );

    if (!mounted) return;
    setState(() => _isSaving = false);

    if (error != null) {
      AppSnackbar.error(context, error);
      return;
    }

    if (snoozedUntil == null) {
      final label = status == 'closed' ? 'Closed' : 'Opened';
      AppSnackbar.success(context, 'Conversation $label');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = widget.conversation.status;
    final color = _statusColor(status);
    final label = _statusLabel(status);
    final isCompact = MediaQuery.of(context).size.width < 600;

    return PopupMenuButton<String>(
      enabled: !_isSaving,
      tooltip: 'Change status',
      onSelected: _changeStatus,
      offset: const Offset(0, 44),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      itemBuilder: (context) => [
        _buildStatusMenuItem(
          value: 'open',
          icon: Icons.mark_chat_read_rounded,
          label: 'Open',
          color: const Color(0xFF008B65),
          isActive: status == 'open',
        ),
        _buildStatusMenuItem(
          value: 'snooze',
          icon: Icons.snooze_rounded,
          label: 'Snooze Conversation',
          color: const Color(0xFFD88222),
          isActive: status == 'pending',
        ),
        _buildStatusMenuItem(
          value: 'close',
          icon: Icons.check_circle_outline_rounded,
          label: 'Close Conversation',
          color: const Color(0xFF697386),
          isActive: status == 'closed',
        ),
      ],
      child: Container(
        height: 38,
        padding: EdgeInsets.symmetric(horizontal: isCompact ? 8 : 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.24)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_isSaving)
              SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: color,
                ),
              )
            else
              Icon(
                _statusIcon(status),
                size: 16,
                color: color,
              ),
            if (!isCompact) ...[
              const SizedBox(width: 7),
              Text(
                label,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: color,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            const SizedBox(width: 3),
            Icon(Icons.keyboard_arrow_down_rounded, size: 16, color: color),
          ],
        ),
      ),
    );
  }

  PopupMenuItem<String> _buildStatusMenuItem({
    required String value,
    required IconData icon,
    required String label,
    required Color color,
    required bool isActive,
  }) {
    return PopupMenuItem<String>(
      value: value,
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 10),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontWeight: isActive ? FontWeight.w700 : FontWeight.w600,
              fontSize: 13,
            ),
          ),
          if (isActive) ...[
            const Spacer(),
            Icon(Icons.check_rounded, size: 16, color: color),
          ],
        ],
      ),
    );
  }

  static String _statusLabel(String status) {
    switch (status) {
      case 'pending':
        return 'Snoozed';
      case 'closed':
        return 'Closed';
      case 'resolved':
        return 'Resolved';
      case 'open':
      default:
        return 'Open';
    }
  }

  static Color _statusColor(String status) {
    switch (status) {
      case 'pending':
        return const Color(0xFFD88222);
      case 'resolved':
        return const Color(0xFF1D6FE8);
      case 'closed':
        return const Color(0xFF697386);
      case 'open':
      default:
        return const Color(0xFF008B65);
    }
  }

  static IconData _statusIcon(String status) {
    switch (status) {
      case 'pending':
        return Icons.snooze_rounded;
      case 'resolved':
        return Icons.done_all_rounded;
      case 'closed':
        return Icons.check_circle_outline_rounded;
      case 'open':
      default:
        return Icons.mark_chat_read_rounded;
    }
  }
}

// ── Snooze Dialog ──────────────────────────────────────
class _SnoozeDialog extends StatefulWidget {
  const _SnoozeDialog();

  @override
  State<_SnoozeDialog> createState() => _SnoozeDialogState();
}

class _SnoozeDialogState extends State<_SnoozeDialog> {
  DateTime? _pickedDate;
  TimeOfDay? _pickedTime;

  @override
  void initState() {
    super.initState();
    // Default: snooze 4 hours
    final def = DateTime.now().add(const Duration(hours: 4));
    _pickedDate = DateTime(def.year, def.month, def.day);
    _pickedTime = TimeOfDay(hour: def.hour, minute: def.minute);
  }

  DateTime get _combined {
    final d = _pickedDate!;
    final t = _pickedTime!;
    return DateTime(d.year, d.month, d.day, t.hour, t.minute);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      title: const Row(
        children: [
          Icon(Icons.snooze_rounded, color: Color(0xFFD88222), size: 22),
          SizedBox(width: 10),
          Text('Snooze Conversation'),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Quick presets
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _snoozePreset('1 Hour', const Duration(hours: 1)),
              _snoozePreset('4 Hours', const Duration(hours: 4)),
              _snoozePreset('Tomorrow 9 AM', null, tomorrow9am: true),
              _snoozePreset('Next Week', const Duration(days: 7)),
            ],
          ),
          const SizedBox(height: 18),
          const Divider(),
          const SizedBox(height: 10),
          // Custom date + time
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final d = await showDatePicker(
                      context: context,
                      initialDate: _pickedDate ?? DateTime.now(),
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (d != null) setState(() => _pickedDate = d);
                  },
                  icon: const Icon(Icons.calendar_today_rounded, size: 16),
                  label: Text(
                    _pickedDate != null
                        ? '${_pickedDate!.day}/${_pickedDate!.month}/${_pickedDate!.year}'
                        : 'Pick date',
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final t = await showTimePicker(
                      context: context,
                      initialTime: _pickedTime ?? TimeOfDay.now(),
                    );
                    if (t != null) setState(() => _pickedTime = t);
                  },
                  icon: const Icon(Icons.access_time_rounded, size: 16),
                  label: Text(
                    _pickedTime != null
                        ? '${_pickedTime!.hour.toString().padLeft(2, '0')}:${_pickedTime!.minute.toString().padLeft(2, '0')}'
                        : 'Pick time',
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton.icon(
          onPressed: () {
            if (_pickedDate == null || _pickedTime == null) return;
            final when = _combined;
            if (when.isBefore(DateTime.now())) {
              AppSnackbar.error(context, 'Please pick a future time');
              return;
            }
            Navigator.pop(context, when);
          },
          icon: const Icon(Icons.snooze_rounded, size: 16),
          label: const Text('Snooze'),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFFD88222),
          ),
        ),
      ],
    );
  }

  Widget _snoozePreset(String label, Duration? duration,
      {bool tomorrow9am = false}) {
    return ActionChip(
      label: Text(label, style: const TextStyle(fontSize: 12)),
      onPressed: () {
        DateTime when;
        if (tomorrow9am) {
          final now = DateTime.now();
          when = DateTime(now.year, now.month, now.day + 1, 9, 0);
        } else {
          when = DateTime.now().add(duration!);
        }
        Navigator.pop(context, when);
      },
    );
  }
}

class _ChatStateMessage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final bool showSpinner;

  const _ChatStateMessage({
    required this.icon,
    required this.title,
    required this.message,
    this.showSpinner = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 360),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 92,
              height: 92,
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: showSpinner
                  ? SizedBox(
                      width: 28,
                      height: 28,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: theme.colorScheme.primary,
                      ),
                    )
                  : Icon(
                      icon,
                      color: theme.colorScheme.primary.withValues(alpha: 0.55),
                      size: 42,
                    ),
            ),
            const SizedBox(height: 18),
            Text(
              title,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.78),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
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

// ── Template Picker Dialog ──────────────────────────────
class _TemplatePickerDialog extends StatefulWidget {
  final String channelId;
  const _TemplatePickerDialog({required this.channelId});

  @override
  State<_TemplatePickerDialog> createState() => _TemplatePickerDialogState();
}

class _TemplatePickerDialogState extends State<_TemplatePickerDialog> {
  List<Map<String, dynamic>> _templates = [];
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _selected;
  final Map<String, TextEditingController> _varControllers = {};

  @override
  void initState() {
    super.initState();
    _loadTemplates();
  }

  Future<void> _loadTemplates() async {
    try {
      final dioClient = di.sl<DioClient>();
      final resp = await dioClient.dio.get(
        ApiConstants.channelTemplates(widget.channelId),
        queryParameters: {'status': 'APPROVED'},
      );
      final list = resp.data is List
          ? resp.data as List
          : (resp.data['data'] ?? []) as List;
      setState(() {
        _templates = list.cast<Map<String, dynamic>>();
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  List<String> _extractVariables(Map<String, dynamic> template) {
    final vars = <String>{};
    final components = template['components'];
    if (components is List) {
      for (final comp in components) {
        if (comp is Map && comp['type'] == 'BODY') {
          final text = comp['text'] as String? ?? '';
          final matches = RegExp(r'\{\{(\d+)\}\}').allMatches(text);
          for (final m in matches) {
            vars.add(m.group(1)!);
          }
        }
      }
    }
    return vars.toList()..sort();
  }

  String _getBodyText(Map<String, dynamic> template) {
    final components = template['components'];
    if (components is List) {
      for (final comp in components) {
        if (comp is Map && comp['type'] == 'BODY') {
          return comp['text'] as String? ?? '';
        }
      }
    }
    return '';
  }

  @override
  void dispose() {
    for (final c in _varControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: const Text('Send Template'),
      content: SizedBox(
        width: 480,
        height: 460,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text('Error: $_error'))
                : _templates.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.description_outlined,
                                  size: 48,
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.25)),
                              const SizedBox(height: 16),
                              Text('No approved templates',
                                  style: theme.textTheme.titleMedium),
                              const SizedBox(height: 8),
                              Text(
                                'Sync your templates from Meta in\nSettings → Channels → Sync Templates',
                                textAlign: TextAlign.center,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.5),
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                    : _selected == null
                        ? _buildTemplateList(theme)
                        : _buildVariableForm(theme),
      ),
      actions: _selected == null
          ? [
              TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel'))
            ]
          : [
              TextButton(
                onPressed: () => setState(() => _selected = null),
                child: const Text('Back'),
              ),
              FilledButton(
                onPressed: _onSend,
                child: const Text('Send'),
              ),
            ],
    );
  }

  Widget _buildTemplateList(ThemeData theme) {
    return ListView.separated(
      itemCount: _templates.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (_, i) {
        final t = _templates[i];
        final name = t['name'] ?? '';
        final lang = t['language'] ?? '';
        final body = _getBodyText(t);
        return ListTile(
          title:
              Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(lang, style: theme.textTheme.bodySmall),
              if (body.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(body,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                    )),
              ],
            ],
          ),
          onTap: () {
            final vars = _extractVariables(t);
            _varControllers.clear();
            for (final v in vars) {
              _varControllers[v] = TextEditingController();
            }
            setState(() => _selected = t);
          },
        );
      },
    );
  }

  Widget _buildVariableForm(ThemeData theme) {
    final vars = _extractVariables(_selected!);
    final body = _getBodyText(_selected!);
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_selected!['name'] ?? '', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(body, style: theme.textTheme.bodySmall),
          ),
          if (vars.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('Variables', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            ...vars.map((v) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: TextField(
                    controller: _varControllers[v],
                    decoration: InputDecoration(
                      labelText: '{{$v}}',
                      border: const OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                )),
          ],
        ],
      ),
    );
  }

  void _onSend() {
    final vars = _extractVariables(_selected!);
    Map<String, String>? variables;
    if (vars.isNotEmpty) {
      variables = {};
      for (final v in vars) {
        variables[v] = _varControllers[v]?.text ?? '';
      }
    }
    Navigator.pop(context, {
      'templateId': _selected!['id'],
      'variables': variables,
    });
  }
}

// ── Action Menu Button (floating "+" menu) ─────────────
class _MoreActionsMenu extends StatelessWidget {
  final bool isSending;
  final VoidCallback onQuickReply;
  final VoidCallback onTemplate;

  const _MoreActionsMenu({
    required this.isSending,
    required this.onQuickReply,
    required this.onTemplate,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return PopupMenuButton<String>(
      enabled: !isSending,
      tooltip: 'More',
      icon: Icon(
        Icons.add_circle_outline_rounded,
        size: 24,
        color: isSending
            ? theme.colorScheme.onSurface.withValues(alpha: 0.3)
            : theme.colorScheme.onSurface.withValues(alpha: 0.55),
      ),
      constraints: const BoxConstraints(minWidth: 38, minHeight: 38),
      padding: EdgeInsets.zero,
      offset: const Offset(0, -130),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      elevation: 6,
      onSelected: (value) {
        if (value == 'quick_reply') onQuickReply();
        if (value == 'template') onTemplate();
      },
      itemBuilder: (context) => [
        _menuItem(
            context, 'quick_reply', Icons.bolt_outlined, 'Quick Reply', theme),
        _menuItem(
            context, 'template', Icons.description_outlined, 'Template', theme),
      ],
    );
  }

  PopupMenuEntry<String> _menuItem(
    BuildContext context,
    String value,
    IconData icon,
    String label,
    ThemeData theme,
  ) {
    return PopupMenuItem<String>(
      value: value,
      height: 44,
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 18, color: theme.colorScheme.primary),
          ),
          const SizedBox(width: 12),
          Text(label,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w500,
              )),
        ],
      ),
    );
  }
}

// ── Quick Reply Panel ───────────────────────────────────
class _QuickReplyPanel extends StatefulWidget {
  final void Function(String content) onSelect;
  final VoidCallback onClose;

  const _QuickReplyPanel({required this.onSelect, required this.onClose});

  @override
  State<_QuickReplyPanel> createState() => _QuickReplyPanelState();
}

class _QuickReplyPanelState extends State<_QuickReplyPanel> {
  List<Map<String, dynamic>> _replies = [];
  bool _loading = true;
  String _search = '';
  bool _showCreateForm = false;
  final _titleCtrl = TextEditingController();
  final _contentCtrl = TextEditingController();
  final _shortcutCtrl = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadReplies();
  }

  Future<void> _loadReplies() async {
    try {
      final dioClient = di.sl<DioClient>();
      final resp = await dioClient.dio.get(ApiConstants.quickReplies);
      final data = resp.data;
      final list = data is List ? data : (data['data'] ?? []) as List;
      setState(() {
        _replies = list.cast<Map<String, dynamic>>();
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    if (_search.isEmpty) return _replies;
    final q = _search.toLowerCase();
    return _replies.where((r) {
      final title = (r['title'] ?? '').toString().toLowerCase();
      final content = (r['content'] ?? '').toString().toLowerCase();
      final shortcut = (r['shortcut'] ?? '').toString().toLowerCase();
      return title.contains(q) || content.contains(q) || shortcut.contains(q);
    }).toList();
  }

  Future<void> _createReply() async {
    if (_titleCtrl.text.trim().isEmpty || _contentCtrl.text.trim().isEmpty) {
      return;
    }
    setState(() => _saving = true);
    try {
      final dioClient = di.sl<DioClient>();
      await dioClient.dio.post(ApiConstants.quickReplies, data: {
        'title': _titleCtrl.text.trim(),
        'content': _contentCtrl.text.trim(),
        if (_shortcutCtrl.text.trim().isNotEmpty)
          'shortcut': _shortcutCtrl.text.trim(),
      });
      _titleCtrl.clear();
      _contentCtrl.clear();
      _shortcutCtrl.clear();
      setState(() {
        _showCreateForm = false;
        _saving = false;
      });
      _loadReplies();
    } catch (e) {
      setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _contentCtrl.dispose();
    _shortcutCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      height: 280,
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          top: BorderSide(color: theme.dividerColor.withValues(alpha: 0.8)),
        ),
      ),
      child: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 8, 0),
            child: Row(
              children: [
                Icon(Icons.bolt_outlined,
                    size: 18, color: theme.colorScheme.primary),
                const SizedBox(width: 6),
                Text('Quick Replies', style: theme.textTheme.titleSmall),
                const Spacer(),
                TextButton.icon(
                  onPressed: () =>
                      setState(() => _showCreateForm = !_showCreateForm),
                  icon: Icon(_showCreateForm ? Icons.list_rounded : Icons.add,
                      size: 18),
                  label: Text(_showCreateForm ? 'List' : 'New'),
                ),
                IconButton(
                  onPressed: widget.onClose,
                  icon: const Icon(Icons.close, size: 18),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
          ),
          if (!_showCreateForm) ...[
            // Search
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: TextField(
                onChanged: (v) => setState(() => _search = v),
                decoration: InputDecoration(
                  hintText: 'Search or type / shortcut...',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(vertical: 8),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                ),
              ),
            ),
            // List
            Expanded(
              child: _loading
                  ? const Center(
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : _filtered.isEmpty
                      ? Center(
                          child: Text('No quick replies found',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.5),
                              )),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: _filtered.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (_, i) {
                            final r = _filtered[i];
                            final shortcut = r['shortcut'] as String?;
                            return ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              title: Row(
                                children: [
                                  Flexible(
                                    child: Text(
                                      r['title'] ?? '',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 13),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  if (shortcut != null &&
                                      shortcut.isNotEmpty) ...[
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 1),
                                      decoration: BoxDecoration(
                                        color:
                                            theme.colorScheme.primaryContainer,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(shortcut,
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: theme
                                                .colorScheme.onPrimaryContainer,
                                          )),
                                    ),
                                  ],
                                ],
                              ),
                              subtitle: Text(
                                r['content'] ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodySmall,
                              ),
                              onTap: () => widget.onSelect(r['content'] ?? ''),
                            );
                          },
                        ),
            ),
          ] else ...[
            // Create form
            Expanded(
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                child: Column(
                  children: [
                    TextField(
                      controller: _titleCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Title',
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _shortcutCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Shortcut (optional, e.g. /hello)',
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Expanded(
                      child: TextField(
                        controller: _contentCtrl,
                        maxLines: null,
                        expands: true,
                        textAlignVertical: TextAlignVertical.top,
                        decoration: const InputDecoration(
                          labelText: 'Content',
                          isDense: true,
                          border: OutlineInputBorder(),
                          alignLabelWithHint: true,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: () =>
                              setState(() => _showCreateForm = false),
                          child: const Text('Cancel'),
                        ),
                        const SizedBox(width: 8),
                        FilledButton(
                          onPressed: _saving ? null : _createReply,
                          child: _saving
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: Colors.white),
                                )
                              : const Text('Save'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StagePickerDialog extends StatefulWidget {
  final String status;
  final Set<String>? categoryFilter;
  const _StagePickerDialog({required this.status, this.categoryFilter});

  @override
  State<_StagePickerDialog> createState() => _StagePickerDialogState();
}

class _StagePickerDialogState extends State<_StagePickerDialog> {
  List<Map<String, dynamic>> _stages = [];
  bool _loading = true;
  String? _selectedCategory; // null = step 1 (choose category)

  @override
  void initState() {
    super.initState();
    _loadStages();
  }

  Future<void> _loadStages() async {
    try {
      final dioClient = di.sl<DioClient>();
      final resp = await dioClient.dio.get(ApiConstants.stagesActive);
      final data = resp.data;
      final list = data is List ? data : (data['data'] ?? []) as List;
      final all = list.cast<Map<String, dynamic>>();
      final filter = widget.categoryFilter;
      setState(() {
        _stages = filter == null
            ? all
            : all
                .where((s) => filter
                    .contains((s['category'] as String?) ?? 'progressing'))
                .toList();
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Color _hexToColor(String? hex) {
    final raw = (hex ?? '#3B82F6').replaceFirst('#', '');
    final value = int.tryParse(raw, radix: 16) ?? 0x3B82F6;
    return Color(0xFF000000 | value);
  }

  List<Map<String, dynamic>> get _filteredStages {
    if (_selectedCategory == null) return _stages;
    return _stages
        .where((s) => (s['category'] as String?) == _selectedCategory)
        .toList();
  }

  bool get _hasWon => _stages.any((s) => s['category'] == 'won');
  bool get _hasLost => _stages.any((s) => s['category'] == 'lost');

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400, maxHeight: 480),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.fromLTRB(20, 16, 12, 12),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(
                      color: theme.dividerColor.withValues(alpha: 0.5)),
                ),
              ),
              child: Row(
                children: [
                  if (_selectedCategory != null)
                    IconButton(
                      onPressed: () => setState(() => _selectedCategory = null),
                      icon: const Icon(Icons.arrow_back_rounded, size: 20),
                      tooltip: 'Back',
                      style: IconButton.styleFrom(
                        minimumSize: const Size(32, 32),
                        padding: EdgeInsets.zero,
                      ),
                    ),
                  if (_selectedCategory != null) const SizedBox(width: 4),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _selectedCategory == null
                              ? 'Close Conversation'
                              : 'Select Stage',
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _selectedCategory == null
                              ? 'What was the outcome?'
                              : _selectedCategory == 'won'
                                  ? 'Won - Pick the final stage'
                                  : 'Lost - Pick the reason',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.5),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded, size: 20),
                    tooltip: 'Cancel',
                    style: IconButton.styleFrom(
                      minimumSize: const Size(32, 32),
                      padding: EdgeInsets.zero,
                    ),
                  ),
                ],
              ),
            ),
            // Body
            Flexible(
              child: _loading
                  ? const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  : AnimatedSwitcher(
                      duration: const Duration(milliseconds: 250),
                      switchInCurve: Curves.easeOut,
                      switchOutCurve: Curves.easeIn,
                      child: _selectedCategory == null
                          ? _buildCategoryStep(theme)
                          : _buildStageStep(theme),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategoryStep(ThemeData theme) {
    return Padding(
      key: const ValueKey('category_step'),
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_hasWon)
            _CategoryCard(
              icon: Icons.emoji_events_rounded,
              title: 'Won',
              subtitle: 'Deal closed successfully',
              color: const Color(0xFF059669),
              onTap: () => setState(() => _selectedCategory = 'won'),
            ),
          if (_hasWon && _hasLost) const SizedBox(height: 12),
          if (_hasLost)
            _CategoryCard(
              icon: Icons.cancel_rounded,
              title: 'Lost',
              subtitle: 'Deal did not close',
              color: const Color(0xFFDC2626),
              onTap: () => setState(() => _selectedCategory = 'lost'),
            ),
          if (!_hasWon && !_hasLost)
            Padding(
              padding: const EdgeInsets.all(20),
              child: Text(
                'No stages configured for close.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildStageStep(ThemeData theme) {
    final filtered = _filteredStages;
    if (filtered.isEmpty) {
      return Padding(
        key: const ValueKey('no_stages'),
        padding: const EdgeInsets.all(20),
        child: Text(
          'No stages in this category.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
          ),
        ),
      );
    }

    return SingleChildScrollView(
      key: const ValueKey('stage_step'),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (int i = 0; i < filtered.length; i++) ...[
            if (i > 0) const SizedBox(height: 8),
            _buildStageTile(filtered[i], theme),
          ],
        ],
      ),
    );
  }

  Widget _buildStageTile(Map<String, dynamic> s, ThemeData theme) {
    final name = s['name'] as String? ?? 'Unnamed';
    final color = _hexToColor(s['color'] as String?);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => Navigator.of(context).pop(s),
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.06),
            border: Border.all(color: color.withValues(alpha: 0.20)),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Container(
                width: 14,
                height: 14,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  name,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Icon(
                Icons.arrow_forward_ios_rounded,
                size: 14,
                color: color.withValues(alpha: 0.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CategoryCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _CategoryCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(14),
            border:
                Border.all(color: color.withValues(alpha: 0.22), width: 1.5),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 26),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: color,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.5),
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.arrow_forward_ios_rounded,
                color: color.withValues(alpha: 0.5),
                size: 18,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
