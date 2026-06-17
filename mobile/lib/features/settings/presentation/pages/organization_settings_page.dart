// ============================================================
// Organization Settings Page - Editable
// ============================================================
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:http/http.dart' as http;
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/theme/app_style.dart';
import 'package:simpulx/core/utils/app_datetime.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

class OrganizationSettingsPage extends StatefulWidget {
  const OrganizationSettingsPage({super.key});

  @override
  State<OrganizationSettingsPage> createState() =>
      _OrganizationSettingsPageState();
}

class _OrganizationSettingsPageState extends State<OrganizationSettingsPage> {
  final _nameController = TextEditingController();
  final _slugController = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  bool _dirty = false;
  String? _error;
  Map<String, dynamic>? _org;
  String _timezone = 'Asia/Jakarta';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _slugController.dispose();
    super.dispose();
  }

  String? get _token {
    final s = context.read<AuthBloc>().state;
    return s is AuthAuthenticated ? s.session.accessToken : null;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await http.get(
        Uri.parse('${ApiConstants.baseUrl}${ApiConstants.organization}'),
        headers: {
          'Authorization': 'Bearer $_token',
          'Content-Type': 'application/json',
        },
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        _org = data;
        _nameController.text = data['name'] ?? '';
        _slugController.text = data['slug'] ?? '';
        final settings = data['settings'] as Map<String, dynamic>? ?? {};
        _timezone = (settings['timezone'] as String?) ?? 'Asia/Jakarta';
        _dirty = false;
      } else {
        _error = 'Failed to load organization (${res.statusCode})';
      }
    } catch (e) {
      _error = 'Network error: $e';
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final body = <String, dynamic>{};
      if (_nameController.text.trim() != (_org?['name'] ?? '')) {
        body['name'] = _nameController.text.trim();
      }
      if (_slugController.text.trim() != (_org?['slug'] ?? '')) {
        body['slug'] = _slugController.text.trim();
      }
      // Always include timezone in settings
      final existingSettings =
          (_org?['settings'] as Map<String, dynamic>?) ?? {};
      final newTz = _timezone;
      if (existingSettings['timezone'] != newTz || body.isNotEmpty) {
        body['settings'] = {...existingSettings, 'timezone': newTz};
      }
      if (body.isEmpty) {
        setState(() => _saving = false);
        return;
      }
      final res = await http.patch(
        Uri.parse('${ApiConstants.baseUrl}${ApiConstants.organization}'),
        headers: {
          'Authorization': 'Bearer $_token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode(body),
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        _org = data;
        _nameController.text = data['name'] ?? '';
        _slugController.text = data['slug'] ?? '';
        final settings = data['settings'] as Map<String, dynamic>? ?? {};
        _timezone = (settings['timezone'] as String?) ?? 'Asia/Jakarta';
        _dirty = false;
        if (mounted) {
          AppSnackbar.success(context, 'Organization updated successfully');
        }
      } else {
        final errBody = jsonDecode(res.body);
        final msg = errBody['message'] ?? 'Update failed (${res.statusCode})';
        if (mounted) {
          AppSnackbar.error(context, msg.toString());
        }
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, 'Error: $e');
      }
    }
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 48, color: Colors.red[300]),
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
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header ───────────────────────
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (_dirty)
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
                  style: FilledButton.styleFrom(
                    backgroundColor: theme.colorScheme.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 20),

          // ── Editable fields ──────────────
          _buildSettingsCard(theme, [
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: 'Organization Name'),
              onChanged: (_) => _markDirty(),
            ),
            TextFormField(
              controller: _slugController,
              decoration: const InputDecoration(
                labelText: 'Workspace Slug',
                helperText:
                    'Used in URLs. Only lowercase letters, numbers, and hyphens.',
              ),
              onChanged: (_) => _markDirty(),
            ),
          ]),
          const SizedBox(height: 20),

          // ── Read-only info ───────────────
          _buildSettingsCard(theme, [
            _buildReadOnlyField(
              label: 'Plan',
              value: 'Max',
            ),
            _buildReadOnlyField(
              label: 'Max Agents',
              value: 'Unlimited',
            ),
            _buildReadOnlyField(
              label: 'API Base URL',
              value: ApiConstants.baseUrl,
            ),
            _buildReadOnlyField(
              label: 'Status',
              value: (_org?['isActive'] ?? _org?['is_active'] ?? true)
                  ? 'Active'
                  : 'Inactive',
            ),
          ]),
          const SizedBox(height: 20),

          // ── Timezone Setting ─────────────
          _buildSettingsCard(theme, [
            DropdownButtonFormField<String>(
              initialValue: _timezone,
              decoration: const InputDecoration(
                labelText: 'Timezone',
                helperText:
                    'Timestamps follow each user device. Scheduling uses this workspace default.',
              ),
              items: const [
                DropdownMenuItem(
                    value: 'Asia/Jakarta',
                    child: Text('WIB - Asia/Jakarta (UTC+7)')),
                DropdownMenuItem(
                    value: 'Asia/Makassar',
                    child: Text('WITA - Asia/Makassar (UTC+8)')),
                DropdownMenuItem(
                    value: 'Asia/Jayapura',
                    child: Text('WIT - Asia/Jayapura (UTC+9)')),
                DropdownMenuItem(
                    value: 'Asia/Singapore',
                    child: Text('SGT - Asia/Singapore (UTC+8)')),
                DropdownMenuItem(
                    value: 'Asia/Tokyo',
                    child: Text('JST - Asia/Tokyo (UTC+9)')),
                DropdownMenuItem(
                    value: 'Asia/Shanghai',
                    child: Text('CST - Asia/Shanghai (UTC+8)')),
                DropdownMenuItem(
                    value: 'Asia/Kolkata',
                    child: Text('IST - Asia/Kolkata (UTC+5:30)')),
                DropdownMenuItem(
                    value: 'Asia/Dubai',
                    child: Text('GST - Asia/Dubai (UTC+4)')),
                DropdownMenuItem(
                    value: 'Europe/London',
                    child: Text('GMT - Europe/London (UTC+0)')),
                DropdownMenuItem(
                    value: 'America/New_York',
                    child: Text('EST - America/New_York (UTC-5)')),
                DropdownMenuItem(
                    value: 'America/Los_Angeles',
                    child: Text('PST - America/Los_Angeles (UTC-8)')),
                DropdownMenuItem(value: 'UTC', child: Text('UTC (UTC+0)')),
              ],
              onChanged: (v) {
                if (v != null) {
                  setState(() {
                    _timezone = v;
                    _dirty = true;
                  });
                }
              },
            ),
          ]),
          const SizedBox(height: 8),
          Text(
            'Your device timezone: ${AppDateTime.deviceTimezoneLabel()}',
            style: AppText.caption.copyWith(color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }

  void _markDirty() {
    if (!_dirty) setState(() => _dirty = true);
  }

  static Widget _buildReadOnlyField({
    required String label,
    required String value,
  }) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 1),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 160,
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF6B7280),
                ),
              ),
            ),
            Expanded(
              child: SelectableText(
                value,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF111827),
                ),
              ),
            ),
          ],
        ),
      );

  static Widget _buildSettingsCard(ThemeData theme, List<Widget> children) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children
            .expand((child) => [child, const SizedBox(height: 14)])
            .toList()
          ..removeLast(),
      ),
    );
  }
}
