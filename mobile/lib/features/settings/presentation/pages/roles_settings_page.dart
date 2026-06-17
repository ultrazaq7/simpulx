// ============================================================
// Roles & Permissions Settings Page
// ============================================================
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';

class RolesSettingsPage extends StatefulWidget {
  const RolesSettingsPage({super.key});

  @override
  State<RolesSettingsPage> createState() => _RolesSettingsPageState();
}

class _RolesSettingsPageState extends State<RolesSettingsPage> {
  static const _builtInRoles = [
    'owner',
    'admin',
    'manager',
    'supervisor',
    'agent'
  ];

  late List<String> _roles;
  late Map<String, String> _customRoleLabels; // key → display label

  static const _permissions = {
    'Sidebar Menu': [
      _Perm('menu_dashboard', 'Dashboard'),
      _Perm('menu_chats', 'Chats'),
      _Perm('menu_contacts', 'Contacts'),
      _Perm('menu_broadcasts', 'Broadcasts'),
      _Perm('menu_automation', 'Automation'),
      _Perm('menu_drip_campaigns', 'Drip Campaigns'),
      _Perm('menu_analytics', 'Analytics'),
      _Perm('menu_audit_log', 'Audit Log'),
      _Perm('menu_settings', 'Settings'),
    ],
    'Dashboard': [
      _Perm('view_dashboard', 'View Dashboard'),
      _Perm('view_analytics', 'View Analytics'),
    ],
    'Chats': [
      _Perm('view_all_chats', 'View All Conversations'),
      _Perm('view_team_chats', 'View Team Conversations'),
      _Perm('assign_chats', 'Assign Conversations'),
      _Perm('close_chats', 'Close Conversations'),
    ],
    'Contacts': [
      _Perm('view_contacts', 'View Contacts'),
      _Perm('create_contacts', 'Create Contacts'),
      _Perm('edit_contacts', 'Edit Contacts'),
      _Perm('delete_contacts', 'Delete Contacts'),
      _Perm('export_contacts', 'Export Contacts'),
    ],
    'Broadcasts': [
      _Perm('view_broadcasts', 'View Broadcasts'),
      _Perm('send_broadcasts', 'Send Broadcasts'),
    ],
    'Automation': [
      _Perm('view_automation', 'View Automation Rules'),
      _Perm('manage_automation', 'Create/Edit Automation'),
    ],
    'Settings': [
      _Perm('view_settings', 'View Settings'),
      _Perm('manage_departments', 'Manage Departments'),
      _Perm('manage_channels', 'Manage Channels'),
      _Perm('manage_team', 'Manage Team Members'),
      _Perm('manage_roles', 'Manage Roles & Permissions'),
      _Perm('manage_contact_fields', 'Manage Contact Fields'),
      _Perm('manage_quick_replies', 'Manage Quick Replies'),
    ],
  };

  late final Map<String, Map<String, bool>> _matrix;
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _roles = List.from(_builtInRoles);
    _customRoleLabels = {};
    _matrix = {};
    for (final role in _roles) {
      _initRoleMatrix(role);
    }
    _loadPermissions();
  }

  Future<void> _loadPermissions() async {
    try {
      final dio = di.sl<DioClient>().dio;
      final resp = await dio.get(ApiConstants.rolePermissions);
      final data = resp.data as Map<String, dynamic>? ?? {};
      setState(() {
        for (final entry in data.entries) {
          final role = entry.key;
          final perms = (entry.value as Map<String, dynamic>)
              .map<String, bool>((k, v) => MapEntry(k, v as bool? ?? false));
          if (_matrix.containsKey(role)) {
            _matrix[role]!.addAll(perms);
          }
        }
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _savePermissions() async {
    setState(() => _saving = true);
    try {
      // Only save manager, supervisor, agent (owner/admin always have all)
      final payload = <String, dynamic>{};
      for (final role in _roles) {
        if (role == 'owner' || role == 'admin') continue;
        payload[role] = _matrix[role];
      }
      final dio = di.sl<DioClient>().dio;
      await dio.put(ApiConstants.rolePermissions, data: payload);
      if (mounted) {
        AppSnackbar.success(context, 'Permissions saved');
        // Update auth session so sidebar/routing updates immediately
        final updatedPerms = <String, Map<String, bool>>{};
        for (final role in _roles) {
          updatedPerms[role] = Map<String, bool>.from(_matrix[role] ?? {});
        }
        context
            .read<AuthBloc>()
            .add(UpdatePermissionsEvent(rolePermissions: updatedPerms));
      }
    } catch (e) {
      if (mounted) AppSnackbar.error(context, 'Failed to save permissions');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _initRoleMatrix(String role) {
    _matrix[role] = {};
    for (final group in _permissions.values) {
      for (final perm in group) {
        _matrix[role]![perm.key] = _defaultValue(role, perm.key);
      }
    }
  }

  bool _defaultValue(String role, String permKey) {
    if (role == 'owner' || role == 'admin') return true;
    // Sidebar menu defaults
    if (permKey.startsWith('menu_')) {
      if (role == 'manager') return true;
      if (role == 'supervisor') {
        return permKey == 'menu_dashboard' ||
            permKey == 'menu_chats' ||
            permKey == 'menu_contacts' ||
            permKey == 'menu_settings';
      }
      // agent
      return permKey == 'menu_dashboard' ||
          permKey == 'menu_chats' ||
          permKey == 'menu_contacts' ||
          permKey == 'menu_settings';
    }
    if (role == 'manager') {
      return !permKey.startsWith('manage_roles') &&
          !permKey.startsWith('manage_channels');
    }
    if (role == 'supervisor') {
      return permKey.startsWith('view_') ||
          permKey == 'assign_chats' ||
          permKey == 'close_chats' ||
          permKey == 'create_contacts' ||
          permKey == 'edit_contacts';
    }
    if (role == 'agent') {
      return permKey == 'view_dashboard' ||
          permKey == 'view_team_chats' ||
          permKey == 'view_contacts' ||
          permKey == 'create_contacts' ||
          permKey == 'edit_contacts' ||
          permKey == 'close_chats';
    }
    // Custom roles default to no permissions
    return false;
  }

  void _showAddRoleDialog() {
    final nameCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Create Custom Role'),
          content: SizedBox(
            width: 380,
            child: TextField(
              controller: nameCtrl,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Role Name',
                hintText: 'e.g. Team Lead',
              ),
              textCapitalization: TextCapitalization.words,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final name = nameCtrl.text.trim();
                if (name.isEmpty) return;
                final key =
                    name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '_');
                if (_roles.contains(key)) {
                  AppSnackbar.error(context, 'Role "$name" already exists');
                  return;
                }
                Navigator.pop(ctx);
                setState(() {
                  _roles.add(key);
                  _customRoleLabels[key] = name;
                  _initRoleMatrix(key);
                });
              },
              child: const Text('Create'),
            ),
          ],
        );
      },
    );
  }

  void _deleteRole(String roleKey) {
    final label = _customRoleLabels[roleKey] ?? roleKey;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Role'),
        content: Text(
            'Are you sure you want to delete "$label"? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              setState(() {
                _roles.remove(roleKey);
                _customRoleLabels.remove(roleKey);
                _matrix.remove(roleKey);
              });
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildHeader(theme),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: _permissions.entries.map((group) {
                return _buildPermissionGroup(theme, group.key, group.value);
              }).toList(),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHeader(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          if (_saving)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: theme.colorScheme.primary),
              ),
            ),
          FilledButton.icon(
            onPressed: _showAddRoleDialog,
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Create Role'),
            style: FilledButton.styleFrom(
              backgroundColor: theme.colorScheme.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPermissionGroup(
      ThemeData theme, String groupName, List<_Perm> perms) {
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.04),
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(12)),
            ),
            child: Row(
              children: [
                Text(
                  groupName,
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                    letterSpacing: 0.3,
                  ),
                ),
                const Spacer(),
                ..._roles.map((role) => SizedBox(
                      width: 100,
                      child: Center(
                        child: _builtInRoles.contains(role)
                            ? Text(
                                _roleLabel(role),
                                style: theme.textTheme.labelSmall?.copyWith(
                                  fontWeight: FontWeight.w600,
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.65),
                                ),
                              )
                            : Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Flexible(
                                    child: Text(
                                      _roleLabel(role),
                                      style:
                                          theme.textTheme.labelSmall?.copyWith(
                                        fontWeight: FontWeight.w600,
                                        color: theme.colorScheme.onSurface
                                            .withValues(alpha: 0.65),
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: 2),
                                  InkWell(
                                    onTap: () => _deleteRole(role),
                                    borderRadius: BorderRadius.circular(10),
                                    child: Icon(
                                      Icons.close_rounded,
                                      size: 14,
                                      color: theme.colorScheme.onSurface
                                          .withValues(alpha: 0.4),
                                    ),
                                  ),
                                ],
                              ),
                      ),
                    )),
              ],
            ),
          ),
          ...perms.map((perm) {
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
              decoration: BoxDecoration(
                border: Border(
                    bottom: BorderSide(
                        color: theme.dividerColor.withValues(alpha: 0.5))),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      perm.label,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w500,
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.8),
                      ),
                    ),
                  ),
                  ..._roles.map((role) {
                    final locked = role == 'owner' || role == 'admin';
                    return SizedBox(
                      width: 100,
                      child: Center(
                        child: Checkbox(
                          value: _matrix[role]![perm.key] ?? false,
                          onChanged: locked
                              ? null
                              : (v) {
                                  setState(() {
                                    _matrix[role]![perm.key] = v ?? false;
                                  });
                                  _savePermissions();
                                },
                          activeColor: theme.colorScheme.primary,
                        ),
                      ),
                    );
                  }),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  String _roleLabel(String role) {
    if (_customRoleLabels.containsKey(role)) return _customRoleLabels[role]!;
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


}

class _Perm {
  final String key;
  final String label;
  const _Perm(this.key, this.label);
}
