// ============================================================
// Profile Settings Page - Editable
// ============================================================
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:http/http.dart' as http;
import 'package:simpulx/core/theme/app_style.dart';
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

class ProfileSettingsPage extends StatefulWidget {
  const ProfileSettingsPage({super.key});

  @override
  State<ProfileSettingsPage> createState() => _ProfileSettingsPageState();
}

class _ProfileSettingsPageState extends State<ProfileSettingsPage> {
  final _nameController = TextEditingController();
  bool _saving = false;
  bool _dirty = false;
  bool _editing = false;

  @override
  void initState() {
    super.initState();
    final authState = context.read<AuthBloc>().state;
    if (authState is AuthAuthenticated) {
      _nameController.text = authState.session.user.fullName;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final authState = context.read<AuthBloc>().state;
    if (authState is! AuthAuthenticated) return;
    final session = authState.session;
    final newName = _nameController.text.trim();
    if (newName.isEmpty || newName == session.user.fullName) {
      setState(() {
        _editing = false;
        _dirty = false;
      });
      return;
    }

    setState(() => _saving = true);
    try {
      final res = await http.patch(
        Uri.parse(
            '${ApiConstants.baseUrl}${ApiConstants.user(session.user.id)}'),
        headers: {
          'Authorization': 'Bearer ${session.accessToken}',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({'fullName': newName}),
      );
      if (res.statusCode == 200 && mounted) {
        AppSnackbar.success(context, 'Profile updated successfully');
        setState(() {
          _editing = false;
          _dirty = false;
        });
      } else if (mounted) {
        final errBody = jsonDecode(res.body);
        AppSnackbar.error(
            context, errBody['message']?.toString() ?? 'Update failed');
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
    final authState = context.watch<AuthBloc>().state;
    final session = authState is AuthAuthenticated ? authState.session : null;
    final role = session?.user.role ?? 'agent';
    final initials = (session?.user.fullName.isNotEmpty ?? false)
        ? session!.user.fullName[0].toUpperCase()
        : '?';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 600),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Profile card ──
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: theme.dividerColor),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.08),
                    blurRadius: 12,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                children: [
                  // Avatar row
                  Row(
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              theme.colorScheme.primary,
                              theme.colorScheme.primary.withValues(alpha: 0.7),
                            ],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Center(
                          child: Text(
                            initials,
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              session?.user.fullName ?? 'Not available',
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                                fontSize: 17,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              session?.user.email ?? '',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.55),
                              ),
                            ),
                          ],
                        ),
                      ),
                      _buildBadge(
                        theme,
                        label: _roleLabel(role),
                        color: _roleColor(theme, role),
                      ),
                    ],
                  ),
                  Divider(
                    height: 28,
                    color: theme.dividerColor.withValues(alpha: 0.5),
                  ),
                  // Info rows
                  _buildInfoRow(
                    theme,
                    icon: Icons.person_rounded,
                    label: 'Full Name',
                    child: _editing
                        ? SizedBox(
                            height: 34,
                            child: TextField(
                              controller: _nameController,
                              style: theme.textTheme.bodyMedium
                                  ?.copyWith(fontWeight: FontWeight.w500),
                              decoration: InputDecoration(
                                isDense: true,
                                contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 8),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
                                  borderSide:
                                      BorderSide(color: theme.dividerColor),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
                                  borderSide: BorderSide(
                                      color: theme.colorScheme.primary),
                                ),
                              ),
                              onChanged: (_) {
                                if (!_dirty) setState(() => _dirty = true);
                              },
                            ),
                          )
                        : Text(
                            session?.user.fullName ?? 'Not available',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                  ),
                  const SizedBox(height: 12),
                  _buildInfoRow(
                    theme,
                    icon: Icons.email_rounded,
                    label: 'Email',
                    child: Text(
                      session?.user.email ?? 'Not available',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildInfoRow(
                    theme,
                    icon: Icons.shield_rounded,
                    label: 'Role',
                    child: Text(
                      _roleLabel(role),
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildInfoRow(
                    theme,
                    icon: Icons.business_rounded,
                    label: 'Workspace',
                    child: Text(
                      session?.organization.name ?? 'Not available',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Actions row
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      if (_editing) ...[
                        TextButton(
                          onPressed: () {
                            _nameController.text = session?.user.fullName ?? '';
                            setState(() {
                              _editing = false;
                              _dirty = false;
                            });
                          },
                          style: TextButton.styleFrom(
                            foregroundColor: theme.colorScheme.onSurface
                                .withValues(alpha: 0.6),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 10),
                          ),
                          child: const Text('Cancel'),
                        ),
                        const SizedBox(width: 8),
                      ],
                      FilledButton.icon(
                        onPressed: _editing
                            ? (_dirty && !_saving ? _save : null)
                            : () => setState(() => _editing = true),
                        icon: _saving
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Icon(
                                _editing
                                    ? Icons.save_rounded
                                    : Icons.edit_rounded,
                                size: 15),
                        label: Text(
                          _saving
                              ? 'Saving...'
                              : _editing
                                  ? 'Save Changes'
                                  : 'Edit Profile',
                        ),
                        style: FilledButton.styleFrom(
                          backgroundColor: theme.colorScheme.primary,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
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
      ),
    );
  }

  static Widget _buildInfoRow(
    ThemeData theme, {
    required IconData icon,
    required String label,
    required Widget child,
  }) {
    return Row(
      children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon,
              size: 15,
              color: theme.colorScheme.primary.withValues(alpha: 0.7)),
        ),
        const SizedBox(width: 12),
        SizedBox(
          width: 85,
          child: Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
        ),
        Expanded(child: child),
      ],
    );
  }

  static Widget _buildBadge(
    ThemeData theme, {
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }

  static String _roleLabel(String role) {
    switch (role) {
      case 'owner':
        return 'Owner';
      case 'admin':
        return 'Admin';
      case 'manager':
        return 'Manager';
      case 'supervisor':
        return 'Supervisor';
      case 'agent':
        return 'Agent';
      default:
        return role;
    }
  }

  static Color _roleColor(ThemeData theme, String role) {
    switch (role) {
      case 'owner':
        return const Color(0xFFE17055);
      case 'admin':
        return AppColors.brandGreenDark;
      case 'manager':
        return const Color(0xFF10B981);
      case 'supervisor':
        return const Color(0xFFF59E0B);
      case 'agent':
      default:
        return theme.colorScheme.primary;
    }
  }
}
