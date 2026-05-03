// ============================================================
// Edit Automation Dialog - Screen 2 (Create / Edit Rule)
// ============================================================
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:simpulx/features/automation/presentation/providers/automation_providers.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

/// Top-level function so it can be called from anywhere with a BuildContext.
void showEditAutomationDialog(BuildContext context, {Map<String, dynamic>? rule}) {
  showDialog(
    context: context,
    builder: (_) => _EditAutomationDialog(rule: rule),
  );
}

class _EditAutomationDialog extends ConsumerStatefulWidget {
  final Map<String, dynamic>? rule;
  const _EditAutomationDialog({this.rule});

  @override
  ConsumerState<_EditAutomationDialog> createState() =>
      _EditAutomationDialogState();
}

class _EditAutomationDialogState extends ConsumerState<_EditAutomationDialog> {
  static const _triggers = {
    'new_conversation': 'New Conversation',
    'new_message': 'New Message Received',
    'conversation_idle': 'Conversation Idle',
    'keyword_match': 'Keyword Match',
    'contact_tag': 'Contact Tag Added',
    'office_hours': 'Office Hours',
    'after_hours': 'After Hours',
  };

  static const _actionTypes = {
    'assign_agent': 'Assign to Agent',
    'assign_team': 'Assign to Department',
    'send_message': 'Send Auto Reply',
    'send_template': 'Send Template Message',
    'add_tag': 'Add Tag',
    'remove_tag': 'Remove Tag',
    'set_priority': 'Set Priority',
    'close_conversation': 'Close Conversation',
    'webhook_notify': 'Webhook Notification',
  };

  late final TextEditingController _nameCtrl;
  late final TextEditingController _descCtrl;
  late final TextEditingController _keywordsCtrl;
  late final TextEditingController _messageCtrl;

  late String _selectedTrigger;
  late String _selectedAction;
  late String _selectedChannelId;
  late bool _isActive;
  bool _isSaving = false;

  bool get _isEditing => widget.rule != null;

  @override
  void initState() {
    super.initState();
    final r = widget.rule;
    _nameCtrl = TextEditingController(text: r?['name'] ?? '');
    _descCtrl = TextEditingController(text: r?['description'] ?? '');
    _keywordsCtrl = TextEditingController(
      text: (r?['triggerConditions']?['keywords'] as List<dynamic>?)
              ?.join(', ') ??
          '',
    );
    _isActive = r?['isActive'] ?? true;

    _selectedTrigger = r?['triggerType'] ?? 'new_message';
    if (!_triggers.containsKey(_selectedTrigger)) _selectedTrigger = 'new_message';

    _selectedChannelId =
        (r?['triggerConditions']?['channelId'] ?? '').toString();

    final existingActions = r?['actions'] as List<dynamic>? ?? [];
    _selectedAction = 'send_message';
    _messageCtrl = TextEditingController();
    if (existingActions.isNotEmpty) {
      final first = existingActions.first;
      _selectedAction = first['actionType']?.toString() ?? 'send_message';
      if (!_actionTypes.containsKey(_selectedAction)) {
        _selectedAction = 'send_message';
      }
      _messageCtrl.text = first['params']?['message']?.toString() ??
          first['params']?['templateName']?.toString() ??
          first['params']?['subject']?.toString() ??
          '';
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _descCtrl.dispose();
    _keywordsCtrl.dispose();
    _messageCtrl.dispose();
    super.dispose();
  }

  bool get _needsKeywords => _selectedTrigger == 'keyword_match';
  bool get _needsMessage =>
      _selectedAction == 'send_message' || _selectedAction == 'send_template';
  bool get _needsWebhookUrl => _selectedAction == 'webhook_notify';

  Future<void> _save() async {
    if (_nameCtrl.text.trim().isEmpty) {
      AppSnackbar.error(context, 'Rule name is required');
      return;
    }
    setState(() => _isSaving = true);

    final triggerConditions = <String, dynamic>{};
    if (_selectedChannelId.isNotEmpty) {
      triggerConditions['channelId'] = _selectedChannelId;
    }
    if (_needsKeywords && _keywordsCtrl.text.trim().isNotEmpty) {
      triggerConditions['keywords'] = _keywordsCtrl.text
          .split(',')
          .map((k) => k.trim())
          .where((k) => k.isNotEmpty)
          .toList();
    }

    final actionParams = <String, dynamic>{};
    if (_needsMessage) {
      actionParams[_selectedAction == 'send_template' ? 'templateName' : 'message'] =
          _messageCtrl.text.trim();
    }
    if (_needsWebhookUrl) {
      actionParams['url'] = _messageCtrl.text.trim();
    }

    final data = {
      'name': _nameCtrl.text.trim(),
      'description':
          _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
      'triggerType': _selectedTrigger,
      'triggerConditions': triggerConditions,
      'actions': [
        {'actionType': _selectedAction, 'params': actionParams}
      ],
      if (!_isEditing) 'isActive': true,
    };

    try {
      final notifier = ref.read(dashboardProvider.notifier);
      if (_isEditing) {
        await notifier.updateRule(widget.rule!['id'], data);
      } else {
        await notifier.createRule(data);
      }
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => _isSaving = false);
      if (mounted) {
        AppSnackbar.error(context, 'Failed: $e');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        width: 580,
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: theme.dividerColor.withValues(alpha: 0.85),
          ),
        ),
        padding: const EdgeInsets.all(28),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Header ──
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      Icons.auto_fix_high_rounded,
                      color: theme.colorScheme.primary,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _isEditing ? 'Edit Automation' : 'New Automation',
                          style: theme.textTheme.titleLarge
                              ?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: theme.colorScheme.onSurface.withValues(alpha: 0.96),
                              ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Configure trigger conditions and actions for this rule.',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.78),
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // ── Name ──
              TextField(
                controller: _nameCtrl,
                decoration: InputDecoration(
                  labelText: 'Rule Name',
                  labelStyle: TextStyle(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.86),
                  ),
                  prefixIcon: Icon(
                    Icons.label_rounded,
                    size: 20,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.82),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // ── Description ──
              TextField(
                controller: _descCtrl,
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: 'Description (optional)',
                  labelStyle: TextStyle(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.86),
                  ),
                  prefixIcon: Icon(
                    Icons.notes_rounded,
                    size: 20,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.82),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // ── Trigger section ──
              _sectionLabel(theme, 'Trigger'),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _selectedTrigger,
                decoration: InputDecoration(
                  labelText: 'When this happens...',
                  labelStyle: TextStyle(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.86),
                  ),
                  prefixIcon: Icon(
                    Icons.flash_on_rounded,
                    size: 20,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.82),
                  ),
                ),
                items: _triggers.entries
                    .map((e) =>
                        DropdownMenuItem(value: e.key, child: Text(e.value)))
                    .toList(),
                onChanged:
                    _isSaving ? null : (v) => setState(() => _selectedTrigger = v!),
              ),
              if (_needsKeywords) ...[
                const SizedBox(height: 16),
                TextField(
                  controller: _keywordsCtrl,
                  decoration: InputDecoration(
                    labelText: 'Keywords (comma-separated)',
                    hintText: 'e.g. promo, harga, booking',
                    labelStyle: TextStyle(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.86),
                    ),
                    hintStyle: TextStyle(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                    ),
                    prefixIcon: Icon(
                      Icons.text_fields_rounded,
                      size: 20,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.82),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 20),

              // ── Channel section ──
              _sectionLabel(theme, 'Channel'),
              const SizedBox(height: 10),
              Consumer(
                builder: (context, ref, _) {
                  final channelsAsync = ref.watch(channelsProvider);
                  return channelsAsync.when(
                    loading: () => const LinearProgressIndicator(minHeight: 2),
                    error: (_, __) => Text(
                      'Could not load channels',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: const Color(0xFFEF4444),
                      ),
                    ),
                    data: (channels) {
                      final items = <DropdownMenuItem<String>>[
                        const DropdownMenuItem(
                          value: '',
                          child: Text('All Channels (no filter)'),
                        ),
                        ...channels.map((ch) {
                          final id = (ch['id'] ?? '').toString();
                          final name = (ch['name'] ?? '').toString();
                          final phone =
                              (ch['phoneNumber'] ?? '').toString();
                          return DropdownMenuItem(
                            value: id,
                            child: Text(
                              phone.isNotEmpty ? '$name ($phone)' : name,
                            ),
                          );
                        }),
                      ];
                      final validIds = channels
                          .map((ch) => (ch['id'] ?? '').toString())
                          .toSet()
                        ..add('');
                      return DropdownButtonFormField<String>(
                        value: validIds.contains(_selectedChannelId)
                            ? _selectedChannelId
                            : '',
                        decoration: InputDecoration(
                          labelText: 'Apply to channel',
                          labelStyle: TextStyle(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.86),
                          ),
                          prefixIcon: Icon(
                            Icons.cell_tower_rounded,
                            size: 20,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.82),
                          ),
                        ),
                        items: items,
                        onChanged: _isSaving
                            ? null
                            : (v) => setState(
                                () => _selectedChannelId = v ?? ''),
                      );
                    },
                  );
                },
              ),
              const SizedBox(height: 20),

              // ── Action section ──
              _sectionLabel(theme, 'Action'),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _selectedAction,
                decoration: InputDecoration(
                  labelText: 'Then do this...',
                  labelStyle: TextStyle(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.86),
                  ),
                  prefixIcon: Icon(
                    Icons.play_arrow_rounded,
                    size: 20,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.82),
                  ),
                ),
                items: _actionTypes.entries
                    .map((e) =>
                        DropdownMenuItem(value: e.key, child: Text(e.value)))
                    .toList(),
                onChanged:
                    _isSaving ? null : (v) => setState(() => _selectedAction = v!),
              ),
              if (_needsMessage) ...[
                const SizedBox(height: 16),
                TextField(
                  controller: _messageCtrl,
                  maxLines: 3,
                  decoration: InputDecoration(
                    labelText: _selectedAction == 'send_template'
                        ? 'Template Name'
                        : 'Reply Message',
                    labelStyle: TextStyle(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.86),
                    ),
                    prefixIcon: Icon(
                      Icons.message_rounded,
                      size: 20,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.82),
                    ),
                  ),
                ),
              ],
              if (_needsWebhookUrl) ...[
                const SizedBox(height: 16),
                TextField(
                  controller: _messageCtrl,
                  decoration: InputDecoration(
                    labelText: 'Webhook URL',
                    hintText: 'https://...',
                    labelStyle: TextStyle(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.86),
                    ),
                    hintStyle: TextStyle(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                    ),
                    prefixIcon: Icon(
                      Icons.link_rounded,
                      size: 20,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.82),
                    ),
                  ),
                ),
              ],

              // ── Status toggle (edit mode) ──
              if (_isEditing) ...[
                const SizedBox(height: 20),
                SwitchListTile(
                  value: _isActive,
                  onChanged: _isSaving
                      ? null
                      : (v) => setState(() => _isActive = v),
                  title: const Text('Active',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    _isActive
                        ? 'This rule is currently running'
                        : 'This rule is paused',
                    style: TextStyle(
                      fontSize: 12,
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.76),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  contentPadding: EdgeInsets.zero,
                ),
              ],

              const SizedBox(height: 28),

              // ── Footer buttons ──
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: _isSaving ? null : () => Navigator.pop(context),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton(
                    onPressed: _isSaving ? null : _save,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF3B82F6),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 12,
                      ),
                    ),
                    child: _isSaving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            _isEditing ? 'Save Changes' : 'Create Automation',
                            style: const TextStyle(color: Colors.white),
                          ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionLabel(ThemeData theme, String text) {
    return Text(
      text,
      style: theme.textTheme.titleSmall?.copyWith(
        fontWeight: FontWeight.w700,
        color: theme.colorScheme.onSurface.withValues(alpha: 0.95),
      ),
    );
  }
}
