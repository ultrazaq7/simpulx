import 'dart:io' show Platform;
import 'package:simpulx/core/widgets/app_snackbar.dart';
import 'package:simpulx/features/chat/domain/entities/chat_entities.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';
import 'package:simpulx/features/chat/presentation/bloc/chat_bloc.dart';
import 'package:simpulx/features/chat/presentation/widgets/assignment_controls.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/utils/app_datetime.dart';
import 'package:simpulx/core/utils/source_channel.dart' as src;
import 'package:simpulx/core/utils/avatar_colors.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

class ChatDetailsPanel extends StatelessWidget {
  final String conversationId;
  final VoidCallback? onClose;
  final ScrollController? scrollController;

  const ChatDetailsPanel({
    super.key,
    required this.conversationId,
    this.onClose,
    this.scrollController,
  });

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ConversationCubit, ConversationListState>(
      builder: (context, state) {
        final conversation = _findConversation(state.conversations);

        if (conversation == null) {
          return const _PanelStateMessage(
            icon: Icons.info_outline_rounded,
            title: 'Details unavailable',
            message:
                'Open the conversation list again to refresh this contact.',
          );
        }

        return _ConversationDetails(
          conversation: conversation,
          onClose: onClose,
          scrollController: scrollController,
        );
      },
    );
  }

  ConversationEntity? _findConversation(
      List<ConversationEntity> conversations) {
    for (final conversation in conversations) {
      if (conversation.id == conversationId) return conversation;
    }
    return null;
  }
}

class _ConversationDetails extends StatelessWidget {
  final ConversationEntity conversation;
  final VoidCallback? onClose;
  final ScrollController? scrollController;

  const _ConversationDetails({
    required this.conversation,
    this.onClose,
    this.scrollController,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final contact = conversation.contact;
    final contactName = contact?.displayName ?? 'Unknown contact';
    final phone = contact?.phone?.trim();
    final whatsappId = contact?.whatsappId?.trim();
    final assignment = _assignmentLabel(conversation);
    final initial = contactName.isNotEmpty ? contactName[0].toUpperCase() : '?';

    return DecoratedBox(
      decoration: BoxDecoration(color: theme.colorScheme.surface),
      child: ListView(
        controller: scrollController,
        padding: EdgeInsets.zero,
        children: [
          // Panel header with close button
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: theme.dividerColor.withValues(alpha: 0.6),
                ),
              ),
            ),
            child: Row(
              children: [
                Text(
                  'Details',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                if (onClose != null)
                  IconButton(
                    onPressed: onClose,
                    icon: const Icon(Icons.close_rounded, size: 20),
                    tooltip: 'Hide details',
                    style: IconButton.styleFrom(
                      minimumSize: const Size(32, 32),
                      padding: EdgeInsets.zero,
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: AvatarColors.getBackgroundColor(contactName),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        initial,
                        style: TextStyle(
                          color: AvatarColors.getColor(contactName),
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            contactName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            phone?.isNotEmpty == true
                                ? phone!
                                : whatsappId?.isNotEmpty == true
                                    ? whatsappId!
                                    : 'No phone number',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.52),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          _DetailSection(
            title: 'Stage',
            children: [
              _StageDropdown(conversation: conversation),
              const SizedBox(height: 8),
              _InterestLevelDropdown(conversation: conversation),
              _FollowUpInfoRow(conversation: conversation),
            ],
          ),
          _DetailSection(
            title: 'Conversation Actions',
            children: [
              _InfoRow(
                icon: Icons.route_rounded,
                label: 'Routing',
                value: conversation.isUnassigned
                    ? 'Waiting for automation or manual assignment'
                    : assignment,
              ),
              _InfoRow(
                icon: Icons.mark_chat_unread_outlined,
                label: 'Unread',
                value: '${conversation.unreadCount}',
              ),
            ],
          ),
          _DetailSection(
            title: 'Customer Details',
            children: [
              _InfoRow(
                icon: Icons.person_outline_rounded,
                label: 'Full name',
                value: contactName,
              ),
              _InfoRow(
                icon: Icons.phone_outlined,
                label: 'Phone',
                value: phone?.isNotEmpty == true ? phone! : 'None',
                copyable: phone?.isNotEmpty == true,
              ),
              if (!kIsWeb && phone?.isNotEmpty == true)
                Padding(
                  padding: const EdgeInsets.only(left: 27, bottom: 12),
                  child: _CtaButton(
                    icon: Icons.call_rounded,
                    label: 'Call',
                    color: const Color(0xFF3B82F6),
                    onTap: () => _trackAndCall(
                      context,
                      phone: phone!,
                      conversationId: conversation.id,
                      contactName: contactName,
                    ),
                  ),
                ),
              _InfoRow(
                icon: Icons.tag_rounded,
                label: 'WhatsApp ID',
                value: whatsappId?.isNotEmpty == true ? whatsappId! : 'None',
                copyable: whatsappId?.isNotEmpty == true,
              ),
              if (!kIsWeb && whatsappId?.isNotEmpty == true)
                Padding(
                  padding: const EdgeInsets.only(left: 27, bottom: 12),
                  child: _CtaButton(
                    icon: Icons.chat_rounded,
                    label: 'Chat on WhatsApp',
                    color: const Color(0xFF25D366),
                    onTap: () {
                      launchUrl(Uri.parse('https://wa.me/$whatsappId'),
                          mode: LaunchMode.externalApplication);
                      _logCta(
                        type: 'whatsapp',
                        conversationId: conversation.id,
                        contactName: contactName,
                        phone: whatsappId!,
                      );
                    },
                  ),
                ),
              if ((contact?.email ?? '').trim().isNotEmpty)
                _InfoRow(
                  icon: Icons.mail_outline_rounded,
                  label: 'Email',
                  value: contact!.email!,
                ),
              if (conversation.sourceLabel != null)
                _InfoRow(
                  icon: Icons.campaign_rounded,
                  label: 'Source',
                  value: conversation.sourceLabel!,
                ),
              _InfoRow(
                icon: Icons.history_rounded,
                label: 'First seen',
                value: contact?.firstSeenAt == null
                    ? 'Unknown'
                    : _formatDateTime(contact!.firstSeenAt!),
              ),
              _InfoRow(
                icon: Icons.schedule_rounded,
                label: 'Last seen',
                value: contact?.lastSeenAt == null
                    ? 'Unknown'
                    : _formatDateTime(contact!.lastSeenAt!),
              ),
              if ((contact?.notes ?? '').trim().isNotEmpty)
                _InfoRow(
                  icon: Icons.notes_rounded,
                  label: 'Notes',
                  value: contact!.notes!,
                ),
            ],
          ),
          _DetailSection(
            title: 'Customer Tags',
            children: [
              _CustomerTagsEditor(conversation: conversation),
            ],
          ),
          _DetailSection(
            title: 'Conversation Details',
            children: [
              _InfoRow(
                icon: Icons.hub_rounded,
                label: 'Channel',
                value: conversation.displayChannel,
              ),
              if ((conversation.sourceChannel ?? '').isNotEmpty)
                _InfoRow(
                  icon: Icons.campaign_outlined,
                  label: 'Source',
                  value: src.prettySourceChannel(conversation.sourceChannel),
                ),
              _InfoRow(
                icon: Icons.groups_2_outlined,
                label: 'Department',
                value: conversation.departmentName?.trim().isNotEmpty == true
                    ? conversation.departmentName!
                    : 'None',
              ),
              _ClickableAgentRow(conversation: conversation),
              if (conversation.firstReplyAt != null)
                _InfoRow(
                  icon: Icons.reply_rounded,
                  label: 'First reply time',
                  value: _formatDateTime(conversation.firstReplyAt!),
                ),
              _InfoRow(
                icon: Icons.mark_email_unread_outlined,
                label: 'Last message',
                value: conversation.lastMessageAt == null
                    ? 'No messages yet'
                    : _formatDateTime(conversation.lastMessageAt!),
              ),
            ],
          ),
          if ((conversation.referralHeadline ?? '').trim().isNotEmpty)
            _DetailSection(
              title: 'Referral',
              children: [
                _InfoRow(
                  icon: Icons.campaign_rounded,
                  label: 'Headline',
                  value: conversation.referralHeadline!,
                ),
                if ((conversation.referralCampaignId ?? '').trim().isNotEmpty)
                  _InfoRow(
                    icon: Icons.track_changes_rounded,
                    label: 'Campaign',
                    value: conversation.referralCampaignId!,
                  ),
              ],
            ),
          _InternalNotesSection(
            conversation: conversation,
          ),
        ],
      ),
    );
  }

  static String _assignmentLabel(ConversationEntity conversation) {
    if (conversation.assignedAgent?.fullName.trim().isNotEmpty == true) {
      return conversation.assignedAgent!.fullName;
    }
    if (conversation.departmentName?.trim().isNotEmpty == true) {
      return conversation.departmentName!;
    }
    if (conversation.assignedAgentId != null) return 'Assigned';
    if (conversation.departmentId != null) return 'Department queue';
    return 'Unassigned';
  }

  static String _formatDateTime(DateTime dateTime) {
    return AppDateTime.shortDateTime(dateTime);
  }

  // ── CTA Tracking ─────────────────────────────────────
  static const _callChannel = MethodChannel('com.simpulx.app/call_tracker');

  static Future<void> _trackAndCall(
    BuildContext context, {
    required String phone,
    required String conversationId,
    required String contactName,
  }) async {
    // On Android mobile: use native call tracking for duration
    if (!kIsWeb && Platform.isAndroid) {
      try {
        // Step 1: Request permission first and WAIT for user response
        final granted =
            await _callChannel.invokeMethod<bool>('requestPermission') ?? false;

        if (granted) {
          // Step 2: Start listener BEFORE launching call
          final resultFuture = _callChannel.invokeMethod<int>('trackCall');

          // Step 3: Launch dialer
          await launchUrl(
            Uri.parse('tel:$phone'),
            mode: LaunchMode.externalApplication,
          );

          // Step 4: Wait for call to finish - native returns duration in seconds
          final durationSeconds = await resultFuture;

          _logCta(
            type: 'phone',
            conversationId: conversationId,
            contactName: contactName,
            phone: phone,
            durationSeconds: durationSeconds == -1 ? null : durationSeconds,
          );

          if (context.mounted &&
              durationSeconds != null &&
              durationSeconds >= 0) {
            final mins = durationSeconds ~/ 60;
            final secs = durationSeconds % 60;
            final label = mins > 0 ? '$mins min $secs sec' : '$secs sec';
            AppSnackbar.success(context, 'Call ended - $label');
          }
        } else {
          // Permission denied - just launch call without tracking
          await launchUrl(
            Uri.parse('tel:$phone'),
            mode: LaunchMode.externalApplication,
          );
          _logCta(
            type: 'phone',
            conversationId: conversationId,
            contactName: contactName,
            phone: phone,
          );
        }
      } catch (_) {
        // Fallback: just launch and log without duration
        await launchUrl(
          Uri.parse('tel:$phone'),
          mode: LaunchMode.externalApplication,
        );
        _logCta(
          type: 'phone',
          conversationId: conversationId,
          contactName: contactName,
          phone: phone,
        );
      }
    } else {
      // Web / iOS: just launch and log tap
      await launchUrl(
        Uri.parse('tel:$phone'),
        mode: LaunchMode.externalApplication,
      );
      _logCta(
        type: 'phone',
        conversationId: conversationId,
        contactName: contactName,
        phone: phone,
      );
    }
  }

  static Future<void> _logCta({
    required String type,
    required String conversationId,
    required String contactName,
    required String phone,
    int? durationSeconds,
  }) async {
    try {
      final dio = di.sl<DioClient>().dio;
      await dio.post('/audit-logs/cta', data: {
        'type': type,
        'conversationId': conversationId,
        'contactName': contactName,
        'phone': phone,
        if (durationSeconds != null) 'durationSeconds': durationSeconds,
      });
    } catch (_) {
      // Fire-and-forget - don't block UI
    }
  }
}

class _DetailSection extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _DetailSection({
    required this.title,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: theme.dividerColor.withValues(alpha: 0.8)),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.82),
            ),
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final bool copyable;


  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    this.copyable = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icon,
            size: 17,
            color: theme.colorScheme.onSurface.withValues(alpha: 0.42),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.46),
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Row(
                  children: [
                    Flexible(
                      child: Text.rich(
                        TextSpan(
                          text: value,
                          children: [
                            if (copyable)
                              WidgetSpan(
                                alignment: PlaceholderAlignment.middle,
                                child: Padding(
                                  padding: const EdgeInsets.only(left: 6),
                                  child: GestureDetector(
                                    onTap: () {
                                      Clipboard.setData(
                                          ClipboardData(text: value));
                                      AppSnackbar.info(
                                          context, '$label copied');
                                    },
                                    child: Icon(
                                      Icons.copy_rounded,
                                      size: 14,
                                      color: theme.colorScheme.primary
                                          .withValues(alpha: 0.6),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.76),
                          fontWeight: FontWeight.w600,
                          height: 1.35,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CtaButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _CtaButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CustomerTagsEditor extends StatefulWidget {
  final ConversationEntity conversation;

  const _CustomerTagsEditor({required this.conversation});

  @override
  State<_CustomerTagsEditor> createState() => _CustomerTagsEditorState();
}

class _CustomerTagsEditorState extends State<_CustomerTagsEditor> {
  final _controller = TextEditingController();
  var _isSaving = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _addTag(String rawTag) async {
    final tag = rawTag.trim();
    if (tag.isEmpty || _isSaving) return;

    final contact = widget.conversation.contact;
    if (contact == null) {
      setState(() => _error = 'Customer data is not loaded yet.');
      return;
    }

    final tags = [...contact.tags];
    final exists = tags.any((item) => item.toLowerCase() == tag.toLowerCase());
    if (exists) {
      _controller.clear();
      return;
    }

    final newTags = [...tags, tag];
    _controller.clear();
    _saveTags(newTags);
  }

  Future<void> _removeTag(String tag) async {
    if (_isSaving) return;
    final contact = widget.conversation.contact;
    if (contact == null) return;

    final tags = contact.tags
        .where((item) => item.toLowerCase() != tag.toLowerCase())
        .toList();
    _saveTags(tags);
  }

  Future<void> _saveTags(List<String> tags) async {
    final contact = widget.conversation.contact;
    if (contact == null) return;

    setState(() {
      _isSaving = true;
      _error = null;
    });

    final error = await context.read<ConversationCubit>().updateContactTags(
          contactId: contact.id,
          tags: tags,
        );

    if (!mounted) return;

    setState(() {
      _isSaving = false;
      _error = error;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tags = widget.conversation.contact?.tags ?? const <String>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (tags.isNotEmpty)
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: tags
                .map(
                  (tag) => _TagPill(
                    label: tag,
                    onDeleted: _isSaving ? null : () => _removeTag(tag),
                  ),
                )
                .toList(),
          )
        else
          Text(
            'No tags yet',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.48),
              fontWeight: FontWeight.w600,
            ),
          ),
        const SizedBox(height: 12),
        TextField(
          controller: _controller,
          enabled: !_isSaving,
          onSubmitted: _addTag,
          decoration: InputDecoration(
            hintText: 'Type a tag and press Enter',
            isDense: true,
            prefixIcon: const Icon(Icons.sell_outlined, size: 18),
            suffixIcon: _isSaving
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : IconButton(
                    tooltip: 'Add tag',
                    onPressed: () => _addTag(_controller.text),
                    icon: const Icon(Icons.add_rounded, size: 19),
                  ),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(
            _error!,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.error,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ],
    );
  }
}

class _ClickableAgentRow extends StatelessWidget {
  final ConversationEntity conversation;

  const _ClickableAgentRow({required this.conversation});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasAgent =
        conversation.assignedAgent?.fullName.trim().isNotEmpty == true;
    final agentName = hasAgent ? conversation.assignedAgent!.fullName : 'None';

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.support_agent_rounded,
            size: 17,
            color: theme.colorScheme.onSurface.withValues(alpha: 0.42),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(4),
              onTap: () => showAssignDialog(context, conversation),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Assigned agent',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.46),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    agentName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: hasAgent
                          ? theme.colorScheme.primary
                          : theme.colorScheme.onSurface.withValues(alpha: 0.76),
                      fontWeight: FontWeight.w600,
                      height: 1.35,
                      decoration: hasAgent
                          ? TextDecoration.underline
                          : TextDecoration.none,
                      decorationColor:
                          theme.colorScheme.primary.withValues(alpha: 0.4),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (hasAgent)
            SizedBox(
              width: 28,
              height: 28,
              child: IconButton(
                padding: EdgeInsets.zero,
                iconSize: 16,
                tooltip: 'Unassign',
                onPressed: () async {
                  final cubit = context.read<ConversationCubit>();
                  final error = await cubit.assignAgent(
                    conversationId: conversation.id,
                    agentId: null,
                  );
                  if (context.mounted && error == null) {
                    AppSnackbar.success(context, 'Agent unassigned');
                  } else if (context.mounted && error != null) {
                    AppSnackbar.error(context, error);
                  }
                },
                icon: Icon(
                  Icons.close_rounded,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _TagPill extends StatelessWidget {
  final String label;
  final VoidCallback? onDeleted;

  const _TagPill({
    required this.label,
    this.onDeleted,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 168),
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
        decoration: BoxDecoration(
          color: theme.colorScheme.primary.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: theme.colorScheme.primary.withValues(alpha: 0.16),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            if (onDeleted != null) ...[
              const SizedBox(width: 5),
              InkWell(
                onTap: onDeleted,
                borderRadius: BorderRadius.circular(8),
                child: Icon(
                  Icons.close_rounded,
                  size: 14,
                  color: theme.colorScheme.primary,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PanelStateMessage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;

  const _PanelStateMessage({
    required this.icon,
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 34,
              color: theme.colorScheme.primary.withValues(alpha: 0.52),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.52),
                height: 1.45,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Color _stageHexToColor(String? hex) {
  final raw = (hex ?? '#3B82F6').replaceFirst('#', '');
  final value = int.tryParse(raw, radix: 16) ?? 0x3B82F6;
  return Color(0xFF000000 | value);
}

class _StageDropdown extends StatefulWidget {
  final ConversationEntity conversation;
  const _StageDropdown({required this.conversation});

  @override
  State<_StageDropdown> createState() => _StageDropdownState();
}

class _StageDropdownState extends State<_StageDropdown> {
  List<Map<String, dynamic>> _stages = [];
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final dioClient = di.sl<DioClient>();
      final resp = await dioClient.dio.get(ApiConstants.stagesActive);
      final data = resp.data;
      final list = data is List ? data : (data['data'] ?? []) as List;
      _stages = list.cast<Map<String, dynamic>>();
      _stages.sort((a, b) {
        final ao = (a['sortOrder'] as num?)?.toInt() ?? 0;
        final bo = (b['sortOrder'] as num?)?.toInt() ?? 0;
        return ao.compareTo(bo);
      });
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _setStage(Map<String, dynamic>? stage) async {
    if (_saving) return;
    setState(() => _saving = true);
    final error =
        await context.read<ConversationCubit>().updateConversationStage(
              conversationId: widget.conversation.id,
              stageId: stage?['id'] as String?,
              stageName: stage?['name'] as String?,
              stageColor: stage?['color'] as String?,
              stageCategory: stage?['category'] as String?,
            );
    if (!mounted) return;
    setState(() => _saving = false);
    if (error != null) {
      AppSnackbar.error(context, error);
    } else {
      AppSnackbar.success(context, 'Stage updated');
    }
  }

  Map<String, dynamic>? _nextProgressing(String? currentId) {
    final progressing = _stages
        .where((s) => (s['category'] ?? 'progressing') == 'progressing')
        .toList();
    if (progressing.isEmpty) return null;
    if (currentId == null) return progressing.first;
    final idx = progressing.indexWhere((s) => s['id'] == currentId);
    if (idx < 0 || idx >= progressing.length - 1) return null;
    return progressing[idx + 1];
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final currentId = widget.conversation.stageId;
    final current = currentId == null
        ? null
        : _stages.firstWhere(
            (s) => s['id'] == currentId,
            orElse: () => <String, dynamic>{
              'name': widget.conversation.stageName ?? currentId,
              'color': widget.conversation.stageColor,
              'category': widget.conversation.stageCategory ?? 'progressing',
            },
          );
    final currentColor = _stageHexToColor(current?['color'] as String?);
    final currentCategory = current?['category'] as String? ?? 'progressing';
    final nextStage = _nextProgressing(currentId);

    if (_loading) {
      return const Padding(
        padding: EdgeInsets.only(bottom: 4),
        child: SizedBox(
          height: 20,
          width: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }

    return Row(
      children: [
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              return SizedBox(
                width: double.infinity,
                child: PopupMenuButton<Map<String, dynamic>?>(
                  position: PopupMenuPosition.under,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                  elevation: 3,
                  constraints: BoxConstraints(minWidth: constraints.maxWidth),
                  onSelected: _setStage,
                  itemBuilder: (context) => _buildMenuItems(theme),
                  child: _StageChip(
                    name: current?['name'] as String? ?? 'No stage',
                    color: current == null ? null : currentColor,
                    category: current == null ? null : currentCategory,
                    saving: _saving,
                  ),
                ),
              );
            },
          ),
        ),
        if (nextStage != null && widget.conversation.status != 'closed') ...[
          const SizedBox(width: 6),
          Tooltip(
            message: 'Advance to "${nextStage['name']}"',
            child: Material(
              color: theme.colorScheme.primary,
              borderRadius: BorderRadius.circular(8),
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: _saving ? null : () => _setStage(nextStage),
                child: const SizedBox(
                  height: 38,
                  width: 38,
                  child: Icon(
                    Icons.chevron_right_rounded,
                    color: Colors.white,
                    size: 22,
                  ),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }

  List<PopupMenuEntry<Map<String, dynamic>?>> _buildMenuItems(ThemeData theme) {
    final isClosed = widget.conversation.status == 'closed';
    final progressing = isClosed
        ? const <Map<String, dynamic>>[]
        : _stages
            .where((s) => (s['category'] ?? 'progressing') == 'progressing')
            .toList();
    final won = isClosed
        ? _stages.where((s) => s['category'] == 'won').toList()
        : const <Map<String, dynamic>>[];
    final lost = isClosed
        ? _stages.where((s) => s['category'] == 'lost').toList()
        : const <Map<String, dynamic>>[];

    return [
      PopupMenuItem<Map<String, dynamic>?>(
        value: null,
        height: 36,
        child: Text(
          'No stage',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      if (progressing.isNotEmpty) ...[
        PopupMenuItem<Map<String, dynamic>?>(
          enabled: false,
          height: 28,
          child: Text(
            'PROGRESSING',
            style: theme.textTheme.labelSmall?.copyWith(
              color: const Color(0xFF047857),
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
            ),
          ),
        ),
        ...progressing.map((s) => _stageMenuItem(s, theme)),
      ],
      if (won.isNotEmpty) ...[
        PopupMenuItem<Map<String, dynamic>?>(
          enabled: false,
          height: 28,
          child: Text(
            'WON',
            style: theme.textTheme.labelSmall?.copyWith(
              color: const Color(0xFF059669),
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
            ),
          ),
        ),
        ...won.map((s) => _stageMenuItem(s, theme)),
      ],
      if (lost.isNotEmpty) ...[
        PopupMenuItem<Map<String, dynamic>?>(
          enabled: false,
          height: 28,
          child: Text(
            'LOST',
            style: theme.textTheme.labelSmall?.copyWith(
              color: const Color(0xFFB91C1C),
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
            ),
          ),
        ),
        ...lost.map((s) => _stageMenuItem(s, theme)),
      ],
    ];
  }

  PopupMenuEntry<Map<String, dynamic>?> _stageMenuItem(
      Map<String, dynamic> s, ThemeData theme) {
    final color = _stageHexToColor(s['color'] as String?);
    return PopupMenuItem<Map<String, dynamic>?>(
      value: s,
      height: 38,
      child: Row(
        children: [
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              s['name'] as String? ?? '',
              style: theme.textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _StageChip extends StatelessWidget {
  final String name;
  final Color? color;
  final String? category;
  final bool saving;

  const _StageChip({
    required this.name,
    required this.color,
    required this.category,
    required this.saving,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isEmpty = color == null;
    final bg = isEmpty
        ? theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35)
        : color!.withValues(alpha: 0.12);
    final border = isEmpty
        ? theme.colorScheme.onSurface.withValues(alpha: 0.10)
        : color!.withValues(alpha: 0.45);
    final fg =
        isEmpty ? theme.colorScheme.onSurface.withValues(alpha: 0.55) : color!;

    return Container(
      height: 38,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: border),
      ),
      child: Row(
        children: [
          if (!isEmpty) ...[
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(
              name,
              style: theme.textTheme.bodySmall?.copyWith(
                color: fg,
                fontWeight: FontWeight.w700,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (saving)
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2, color: fg),
            )
          else
            Icon(Icons.unfold_more_rounded, size: 16, color: fg),
        ],
      ),
    );
  }
}

class _InterestLevelDropdown extends StatelessWidget {
  final ConversationEntity conversation;
  const _InterestLevelDropdown({required this.conversation});

  static const _levels = [
    (value: 'hot', label: 'Hot', color: Colors.red),
    (value: 'warm', label: 'Warm', color: Colors.orange),
    (value: 'cold', label: 'Cold', color: Colors.blue),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final current = conversation.interestLevel;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.thermostat_rounded,
                size: 17,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.42),
              ),
              const SizedBox(width: 10),
              Text(
                'Interest Level',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.46),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          LayoutBuilder(
            builder: (context, constraints) {
              return SizedBox(
                width: double.infinity,
                child: PopupMenuButton<String?>(
                  position: PopupMenuPosition.under,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                  elevation: 3,
                  constraints: BoxConstraints(minWidth: constraints.maxWidth),
                  onSelected: (val) async {
                    final error = await context
                        .read<ConversationCubit>()
                        .updateInterestLevel(
                          conversationId: conversation.id,
                          interestLevel: val,
                        );
                    if (context.mounted) {
                      if (error != null) {
                        AppSnackbar.error(context, error);
                      } else {
                        final label = val != null
                            ? _levels
                                .firstWhere((l) => l.value == val,
                                    orElse: () => _levels.first)
                                .label
                            : 'None';
                        AppSnackbar.success(
                            context, 'Interest level set to $label');
                      }
                    }
                  },
                  itemBuilder: (context) => [
                    PopupMenuItem<String?>(
                      value: null,
                      child: Text(
                        'None',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.42),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    ..._levels.map((l) => PopupMenuItem<String?>(
                          value: l.value,
                          child: Row(
                            children: [
                              Icon(Icons.circle, size: 10, color: l.color),
                              const SizedBox(width: 8),
                              Text(
                                l.label,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        )),
                  ],
                  child: Container(
                    height: 38,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHighest
                          .withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.10),
                      ),
                    ),
                    child: Row(
                      children: [
                        if (current != null) ...[
                          Icon(Icons.circle,
                              size: 10,
                              color: _levels
                                  .firstWhere((l) => l.value == current,
                                      orElse: () => _levels.first)
                                  .color),
                          const SizedBox(width: 8),
                        ],
                        Expanded(
                          child: Text(
                            current != null
                                ? _levels
                                    .firstWhere((l) => l.value == current,
                                        orElse: () => _levels.first)
                                    .label
                                : 'None',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: current != null
                                  ? theme.colorScheme.onSurface
                                      .withValues(alpha: 0.76)
                                  : theme.colorScheme.onSurface
                                      .withValues(alpha: 0.42),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Icon(Icons.unfold_more_rounded,
                            size: 16,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.4)),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _FollowUpInfoRow extends StatelessWidget {
  final ConversationEntity conversation;
  const _FollowUpInfoRow({required this.conversation});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final snoozedUntil = conversation.snoozedUntil;

    String displayValue = 'None';
    bool isOverdue = false;

    if (snoozedUntil != null) {
      displayValue = AppDateTime.shortDateTime(snoozedUntil);
      isOverdue = snoozedUntil.isBefore(DateTime.now());
      if (isOverdue) displayValue = '$displayValue (Overdue)';
    }

    // Only show when status is pending (snoozed)
    if (conversation.status != 'pending' && snoozedUntil == null) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.snooze_rounded,
            size: 17,
            color: theme.colorScheme.onSurface.withValues(alpha: 0.42),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Snoozed Until',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.46),
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  displayValue,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: isOverdue
                        ? const Color(0xFFEF4444)
                        : snoozedUntil != null
                            ? theme.colorScheme.onSurface
                                .withValues(alpha: 0.76)
                            : theme.colorScheme.onSurface
                                .withValues(alpha: 0.42),
                    fontWeight: FontWeight.w600,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InternalNotesSection extends StatefulWidget {
  final ConversationEntity conversation;
  const _InternalNotesSection({required this.conversation});

  @override
  State<_InternalNotesSection> createState() => _InternalNotesSectionState();
}

class _InternalNotesSectionState extends State<_InternalNotesSection> {
  final _controller = TextEditingController();
  List<InternalNoteEntity> _notes = [];
  bool _loading = false;
  bool _adding = false;

  @override
  void initState() {
    super.initState();
    _loadNotes();
  }

  @override
  void didUpdateWidget(covariant _InternalNotesSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.conversation.id != widget.conversation.id) {
      _loadNotes();
    }
  }

  Future<void> _loadNotes() async {
    setState(() => _loading = true);
    try {
      final notes = await context
          .read<ConversationCubit>()
          .getInternalNotes(widget.conversation.id);
      if (mounted) setState(() => _notes = notes);
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _addNote() async {
    final content = _controller.text.trim();
    if (content.isEmpty || _adding) return;
    setState(() => _adding = true);
    final note = await context.read<ConversationCubit>().addInternalNote(
          conversationId: widget.conversation.id,
          content: content,
        );
    if (note != null && mounted) {
      _controller.clear();
      setState(() {
        _notes.insert(0, note);
        _adding = false;
      });
    } else if (mounted) {
      setState(() => _adding = false);
    }
  }

  Future<void> _deleteNote(String noteId) async {
    await context.read<ConversationCubit>().deleteInternalNote(
          conversationId: widget.conversation.id,
          noteId: noteId,
        );
    if (mounted) {
      setState(() => _notes.removeWhere((n) => n.id == noteId));
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

    return _DetailSection(
      title: 'Internal Notes',
      children: [
        TextField(
          controller: _controller,
          enabled: !_adding,
          maxLines: 2,
          minLines: 1,
          onSubmitted: (_) => _addNote(),
          decoration: InputDecoration(
            hintText: 'Add a note...',
            isDense: true,
            prefixIcon: const Icon(Icons.note_add_outlined, size: 18),
            suffixIcon: _adding
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : IconButton(
                    tooltip: 'Add note',
                    onPressed: _addNote,
                    icon: const Icon(Icons.send_rounded, size: 18),
                  ),
          ),
        ),
        const SizedBox(height: 12),
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Center(
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          )
        else if (_notes.isEmpty)
          Text(
            'No notes yet',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.48),
              fontWeight: FontWeight.w600,
            ),
          )
        else
          ..._notes.map((note) => _NoteTile(
                note: note,
                onDelete: () => _deleteNote(note.id),
              )),
      ],
    );
  }
}

class _NoteTile extends StatelessWidget {
  final InternalNoteEntity note;
  final VoidCallback onDelete;

  const _NoteTile({required this.note, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final time =
        '${note.createdAt.day.toString().padLeft(2, '0')}/${note.createdAt.month.toString().padLeft(2, '0')}/${note.createdAt.year} ${note.createdAt.hour.toString().padLeft(2, '0')}:${note.createdAt.minute.toString().padLeft(2, '0')}';

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: theme.colorScheme.onSurface.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: theme.dividerColor.withValues(alpha: 0.7),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.person_outline_rounded,
                  size: 13,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.46),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    note.agentName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: theme.colorScheme.primary,
                      fontSize: 11,
                    ),
                  ),
                ),
                Text(
                  time,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.38),
                    fontSize: 10,
                  ),
                ),
                const SizedBox(width: 4),
                InkWell(
                  onTap: onDelete,
                  borderRadius: BorderRadius.circular(4),
                  child: Icon(
                    Icons.close_rounded,
                    size: 14,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.36),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              note.content,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.72),
                fontWeight: FontWeight.w500,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
