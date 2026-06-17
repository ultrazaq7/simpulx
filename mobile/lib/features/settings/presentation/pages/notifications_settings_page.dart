import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:http/http.dart' as http;

import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';

class NotificationsSettingsPage extends StatefulWidget {
  const NotificationsSettingsPage({super.key});

  @override
  State<NotificationsSettingsPage> createState() =>
      _NotificationsSettingsPageState();
}

class _NotificationsSettingsPageState extends State<NotificationsSettingsPage> {
  static const _defaults = <String, bool>{
    'newMessages': true,
    'newConversations': true,
    'emailDigest': false,
    'sound': true,
  };

  final Map<String, bool> _prefs = Map<String, bool>.from(_defaults);

  bool _loading = true;
  bool _saving = false;
  String? _error;
  Map<String, dynamic>? _organization;

  String? get _token {
    final state = context.read<AuthBloc>().state;
    return state is AuthAuthenticated ? state.session.accessToken : null;
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await http.get(
        Uri.parse('${ApiConstants.baseUrl}${ApiConstants.organization}'),
        headers: {
          'Authorization': 'Bearer $_token',
          'Content-Type': 'application/json',
        },
      );
      if (response.statusCode != 200) {
        throw Exception('Failed to load notification settings');
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final settings = data['settings'] is Map<String, dynamic>
          ? Map<String, dynamic>.from(data['settings'] as Map<String, dynamic>)
          : <String, dynamic>{};
      final notifications = settings['notifications'] is Map<String, dynamic>
          ? Map<String, dynamic>.from(
              settings['notifications'] as Map<String, dynamic>,
            )
          : <String, dynamic>{};

      for (final entry in _defaults.entries) {
        _prefs[entry.key] = notifications[entry.key] as bool? ?? entry.value;
      }
      _organization = data;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
    }
    if (mounted) {
      setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final settings = _organization?['settings'] is Map<String, dynamic>
          ? Map<String, dynamic>.from(
              _organization!['settings'] as Map<String, dynamic>,
            )
          : <String, dynamic>{};
      settings['notifications'] = Map<String, bool>.from(_prefs);

      final response = await http.patch(
        Uri.parse('${ApiConstants.baseUrl}${ApiConstants.organization}'),
        headers: {
          'Authorization': 'Bearer $_token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({'settings': settings}),
      );

      if (response.statusCode != 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>?;
        throw Exception(body?['message']?.toString() ?? 'Failed to save');
      }

      _organization = jsonDecode(response.body) as Map<String, dynamic>;
      if (!mounted) return;
      AppSnackbar.success(context, 'Notification settings saved');
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to save notification settings: $e');
    }
    if (mounted) {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const tiles = [
      _NotificationTile(
        keyName: 'newMessages',
        title: 'New message notifications',
        subtitle: 'Notify the team when a customer sends a new message.',
      ),
      _NotificationTile(
        keyName: 'newConversations',
        title: 'New conversation alerts',
        subtitle: 'Alert when a fresh conversation enters the inbox.',
      ),
      _NotificationTile(
        keyName: 'emailDigest',
        title: 'Email digest',
        subtitle: 'Send a daily summary email for the workspace.',
      ),
      _NotificationTile(
        keyName: 'sound',
        title: 'Sound notifications',
        subtitle: 'Play sound alerts on supported platforms.',
      ),
    ];

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline_rounded, size: 48),
            const SizedBox(height: 12),
            Text(_error!, style: theme.textTheme.bodyMedium),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.save_rounded, size: 18),
                label: Text(_saving ? 'Saving...' : 'Save Changes'),
              ),
            ],
          ),
          const SizedBox(height: 28),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: theme.dividerColor),
            ),
            child: Column(
              children: [
                for (int i = 0; i < tiles.length; i++) ...[
                  SwitchListTile(
                    title: Text(
                      tiles[i].title,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Text(
                      tiles[i].subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.55),
                      ),
                    ),
                    value: _prefs[tiles[i].keyName] ?? false,
                    onChanged: (value) => setState(() {
                      _prefs[tiles[i].keyName] = value;
                    }),
                    contentPadding: EdgeInsets.zero,
                  ),
                  if (i != tiles.length - 1)
                    Divider(color: theme.dividerColor, height: 1),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NotificationTile {
  final String keyName;
  final String title;
  final String subtitle;

  const _NotificationTile({
    required this.keyName,
    required this.title,
    required this.subtitle,
  });
}
