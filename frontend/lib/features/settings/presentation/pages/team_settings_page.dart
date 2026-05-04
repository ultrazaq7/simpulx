// ============================================================
// Team Settings Page - Table view with pagination & delete
// ============================================================
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:simpulx/core/theme/app_style.dart';
import 'package:simpulx/core/utils/app_datetime.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:simpulx/features/settings/data/datasources/settings_remote_datasource.dart';
import 'package:simpulx/features/settings/data/models/settings_models.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';
import 'package:simpulx/features/settings/presentation/pages/team_export.dart'
    as team_export;

class TeamSettingsPage extends StatefulWidget {
  const TeamSettingsPage({super.key});

  @override
  State<TeamSettingsPage> createState() => _TeamSettingsPageState();
}

class _TeamSettingsPageState extends State<TeamSettingsPage> {
  late final SettingsRemoteDataSource _ds;
  final _searchCtrl = TextEditingController();

  bool _loading = false;
  String? _error;
  List<SettingsTeamMemberModel> _members = const [];
  List<SettingsTeamMemberModel> _supervisorCandidates = const [];
  List<SettingsDepartmentModel> _departments = const [];
  int _page = 1;
  int _total = 0;
  int _totalPages = 1;
  String? _roleFilter;
  String? _statusFilter;

  AuthAuthenticated? get _auth {
    final s = context.read<AuthBloc>().state;
    return s is AuthAuthenticated ? s : null;
  }

  String get _currentRole => _auth?.session.user.role ?? 'agent';
  String get _currentUserId => _auth?.session.user.id ?? '';
  bool get _canManage => _roleLevel(_currentRole) >= 3;

  @override
  void initState() {
    super.initState();
    _ds = di.sl<SettingsRemoteDataSource>();
    _loadAll();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadAll() async {
    await Future.wait([
      _loadMembers(),
      _loadSupervisors(),
      _loadDepartments(),
    ]);
  }

  Future<void> _loadMembers({int? page}) async {
    final p = page ?? _page;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final resp = await _ds.getUsers(
        search: _searchCtrl.text,
        role: _roleFilter,
        status: _statusFilter,
        page: p,
        limit: 15,
      );
      if (!mounted) return;
      setState(() {
        _members = resp.users;
        _page = resp.page;
        _total = resp.total;
        _totalPages = resp.totalPages < 1 ? 1 : resp.totalPages;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _loadSupervisors() async {
    try {
      final resp = await _ds.getUsers(page: 1, limit: 200, status: 'active');
      if (!mounted) return;
      setState(() {
        _supervisorCandidates = resp.users
            .where((u) => u.role == 'manager' || u.role == 'supervisor')
            .toList();
      });
    } catch (_) {}
  }

  Future<void> _loadDepartments() async {
    try {
      final depts = await _ds.getDepartments();
      if (!mounted) return;
      setState(() => _departments = depts);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        _buildHeader(theme),
        Expanded(child: _buildBody(theme)),
        if (_totalPages > 1) _buildPagination(theme),
      ],
    );
  }

  Widget _buildHeader(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (_canManage) ...[
                FilledButton.icon(
                  onPressed: () => _showAccountDialog(),
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('Add Member'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                OutlinedButton.icon(
                  onPressed: _loading ? null : _exportMembers,
                  icon: const Icon(Icons.download_rounded, size: 18),
                  label: const Text('Export'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: theme.colorScheme.onSurface,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 12),
                    side: BorderSide(color: theme.dividerColor),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                flex: 3,
                child: TextField(
                  controller: _searchCtrl,
                  onSubmitted: (_) => _loadMembers(page: 1),
                  decoration: InputDecoration(
                    hintText: 'Search member by name or email',
                    hintStyle: TextStyle(
                      fontSize: 13,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
                    ),
                    prefixIcon: Icon(Icons.search_rounded,
                        size: 20,
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                    isDense: true,
                    filled: false,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: theme.dividerColor),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: theme.dividerColor),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Row(
                children: [
                  Icon(Icons.filter_list_rounded,
                      size: 18,
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                  const SizedBox(width: 6),
                  Text('Filter By',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.6),
                      )),
                ],
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 130,
                child: DropdownButtonFormField<String?>(
                  value: _statusFilter,
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(
                      fontSize: 12,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    ),
                    isDense: true,
                    filled: false,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: theme.dividerColor),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: theme.dividerColor),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 10),
                  ),
                  items: const [
                    DropdownMenuItem(value: null, child: Text('All')),
                    DropdownMenuItem(value: 'active', child: Text('Active')),
                    DropdownMenuItem(value: 'invited', child: Text('Invited')),
                    DropdownMenuItem(
                        value: 'inactive', child: Text('Inactive')),
                  ],
                  onChanged: (v) {
                    setState(() => _statusFilter = v);
                    _loadMembers(page: 1);
                  },
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 130,
                child: DropdownButtonFormField<String?>(
                  value: _roleFilter,
                  decoration: InputDecoration(
                    labelText: 'Role',
                    labelStyle: TextStyle(
                      fontSize: 12,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    ),
                    isDense: true,
                    filled: false,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: theme.dividerColor),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: theme.dividerColor),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 10),
                  ),
                  items: const [
                    DropdownMenuItem(value: null, child: Text('All')),
                    DropdownMenuItem(value: 'admin', child: Text('Admin')),
                    DropdownMenuItem(value: 'manager', child: Text('Manager')),
                    DropdownMenuItem(
                        value: 'supervisor', child: Text('Supervisor')),
                    DropdownMenuItem(value: 'agent', child: Text('Agent')),
                  ],
                  onChanged: (v) {
                    setState(() => _roleFilter = v);
                    _loadMembers(page: 1);
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBody(ThemeData theme) {
    if (_loading && _members.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _members.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off_rounded, size: 48),
            const SizedBox(height: 12),
            const Text('Could not load team members'),
            Text(_error!, style: theme.textTheme.bodySmall),
            const SizedBox(height: 10),
            FilledButton(
                onPressed: () => _loadMembers(), child: const Text('Retry')),
          ],
        ),
      );
    }
    if (_members.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.group_rounded,
                size: 48,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.2)),
            const SizedBox(height: 12),
            const Text('No team members match these filters'),
          ],
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(28, 20, 28, 24),
      child: SizedBox(
        width: double.infinity,
        child: DataTable(
          dataRowMinHeight: 54,
          dataRowMaxHeight: 62,
          columns: const [
            DataColumn(label: Text('Full Name')),
            DataColumn(label: Text('Roles')),
            DataColumn(label: Text('Departments')),
            DataColumn(label: Text('User Status')),
            DataColumn(label: Text('Action')),
          ],
          rows: _members.map((m) {
            final canEdit = _canManage &&
                (m.id == _currentUserId
                    ? _currentRole == 'owner'
                    : _roleLevel(_currentRole) > _roleLevel(m.role));

            return DataRow(
              cells: [
                DataCell(Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Stack(
                      children: [
                        CircleAvatar(
                          radius: 18,
                          backgroundColor: Colors.grey.shade200,
                          child: Text(
                            m.fullName.isNotEmpty
                                ? m.fullName[0].toUpperCase()
                                : '?',
                            style: TextStyle(
                              color: Colors.grey.shade600,
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                          ),
                        ),
                        if (m.isOnline)
                          Positioned(
                            bottom: 0,
                            left: 0,
                            child: Container(
                              width: 10,
                              height: 10,
                              decoration: BoxDecoration(
                                color: const Color(0xFF25D366),
                                shape: BoxShape.circle,
                                border: Border.all(
                                    color: theme.colorScheme.surface,
                                    width: 1.5),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 12),
                    Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(m.fullName,
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 14)),
                        Text(m.email,
                            style: TextStyle(
                              fontSize: 12,
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.45),
                            )),
                      ],
                    ),
                  ],
                )),
                DataCell(_outlinedChip(theme, _roleLabel(m.role))),
                DataCell(m.department != null
                    ? _outlinedChip(theme, m.department!.name)
                    : Text('-',
                        style: TextStyle(
                          fontSize: 13,
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.4),
                        ))),
                DataCell(Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      margin: const EdgeInsets.only(right: 8),
                      decoration: BoxDecoration(
                        color: _statusColor(m.status),
                        shape: BoxShape.circle,
                      ),
                    ),
                    Text(
                      _statusLabel(m.status),
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: Color(0xFF374151),
                      ),
                    ),
                  ],
                )),
                DataCell(canEdit
                    ? PopupMenuButton<String>(
                        icon: Icon(Icons.more_vert_rounded,
                            size: 20,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.5)),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        itemBuilder: (_) => [
                          const PopupMenuItem(
                            value: 'edit',
                            child: Row(
                              children: [
                                Icon(Icons.edit_rounded,
                                    size: 18, color: AppColors.primary),
                                SizedBox(width: 10),
                                Text('Edit'),
                              ],
                            ),
                          ),
                          PopupMenuItem(
                            value: 'status',
                            child: Row(
                              children: [
                                Icon(
                                  m.status == 'inactive'
                                      ? Icons.check_circle_outline_rounded
                                      : Icons.block_rounded,
                                  size: 18,
                                  color: m.status == 'inactive'
                                      ? const Color(0xFF25D366)
                                      : const Color(0xFFE8912D),
                                ),
                                const SizedBox(width: 10),
                                Text(m.status == 'inactive'
                                    ? 'Reactivate'
                                    : 'Deactivate'),
                              ],
                            ),
                          ),
                          if ((_currentRole == 'owner' ||
                                  _currentRole == 'admin') &&
                              m.id != _currentUserId &&
                              m.role != 'owner')
                            const PopupMenuItem(
                              value: 'delete',
                              child: Row(
                                children: [
                                  Icon(Icons.delete_rounded,
                                      size: 18, color: Color(0xFFEF4444)),
                                  SizedBox(width: 10),
                                  Text('Delete',
                                      style:
                                          TextStyle(color: Color(0xFFEF4444))),
                                ],
                              ),
                            ),
                        ],
                        onSelected: (value) {
                          switch (value) {
                            case 'edit':
                              _showAccountDialog(member: m);
                              break;
                            case 'status':
                              _confirmStatusChange(m);
                              break;
                            case 'delete':
                              _confirmDeleteUser(m);
                              break;
                          }
                        },
                      )
                    : const SizedBox.shrink()),
              ],
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _outlinedChip(ThemeData theme, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F4F6),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label,
          style: const TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w500,
            color: Color(0xFF374151),
          )),
    );
  }

  Widget _buildPagination(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(top: BorderSide(color: theme.dividerColor)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            onPressed: _page > 1 ? () => _loadMembers(page: _page - 1) : null,
            icon: const Icon(Icons.chevron_left_rounded, size: 22),
          ),
          ...List.generate(
            _totalPages > 7 ? 7 : _totalPages,
            (i) {
              int pn;
              if (_totalPages <= 7) {
                pn = i + 1;
              } else if (_page <= 4) {
                pn = i + 1;
              } else if (_page >= _totalPages - 3) {
                pn = _totalPages - 6 + i;
              } else {
                pn = _page - 3 + i;
              }
              final curr = pn == _page;
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: curr ? null : () => _loadMembers(page: pn),
                  child: Container(
                    width: 34,
                    height: 34,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color:
                          curr ? theme.colorScheme.primary : Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '$pn',
                      style: TextStyle(
                        fontSize: 13,
                        color: curr
                            ? Colors.white
                            : theme.colorScheme.onSurface
                                .withValues(alpha: 0.6),
                        fontWeight: curr ? FontWeight.w700 : FontWeight.normal,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
          IconButton(
            onPressed: _page < _totalPages
                ? () => _loadMembers(page: _page + 1)
                : null,
            icon: const Icon(Icons.chevron_right_rounded, size: 22),
          ),
          const SizedBox(width: 12),
          Text('Page $_page of $_totalPages',
              style: TextStyle(
                  fontSize: 12,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.45))),
        ],
      ),
    );
  }

  // ── Helpers ─────────────────────────────────────────────

  int _roleLevel(String r) {
    switch (r) {
      case 'owner':
        return 5;
      case 'admin':
        return 4;
      case 'manager':
        return 3;
      case 'supervisor':
        return 2;
      case 'agent':
        return 1;
      default:
        return 0;
    }
  }

  String _roleLabel(String r) {
    switch (r) {
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
        return r;
    }
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'active':
        return 'Active';
      case 'inactive':
        return 'Inactive';
      case 'invited':
        return 'Invited';
      default:
        return s;
    }
  }

  Color _roleColor(String r) {
    switch (r) {
      case 'owner':
        return const Color(0xFFE17055);
      case 'admin':
        return AppColors.brandGreenDark;
      case 'manager':
        return const Color(0xFF10B981);
      case 'supervisor':
        return const Color(0xFFF59E0B);
      default:
        return const Color(0xFF3498DB);
    }
  }

  Color _statusColor(String s) {
    switch (s) {
      case 'active':
        return const Color(0xFF25D366);
      case 'invited':
        return const Color(0xFFFDCB6E);
      default:
        return const Color(0xFF95A5A6);
    }
  }

  List<String> _availableRoles() {
    const ordered = ['admin', 'manager', 'supervisor', 'agent'];
    final lvl = _roleLevel(_currentRole);
    return ordered.where((r) => _roleLevel(r) < lvl).toList();
  }

  Future<void> _exportMembers() async {
    try {
      final response = await _ds.getUsers(
        search: _searchCtrl.text,
        role: _roleFilter,
        status: _statusFilter,
        page: 1,
        limit: 1000,
      );
      final csv = _buildMembersCsv(response.users);
      final filename =
          'team_export_${DateTime.now().millisecondsSinceEpoch}.csv';
      team_export.exportCsv(csv, filename);
      if (!mounted) return;
      AppSnackbar.success(context, 'Team export generated successfully');
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, 'Failed to export team: $e');
    }
  }

  String _buildMembersCsv(List<SettingsTeamMemberModel> members) {
    const headers = [
      'User ID',
      'Full Name',
      'Email',
      'Role',
      'Status',
      'Department',
      'Department ID',
      'Supervisor',
      'Supervisor ID',
      'Max Concurrent Chats',
      'Round Robin',
      'Online',
      'Created At',
      'Last Seen At',
    ];
    final rows = <List<String>>[
      headers,
      ...members.map(
        (member) => [
          member.id,
          member.fullName,
          member.email,
          member.role,
          member.status,
          member.department?.name ?? '',
          member.department?.id ?? '',
          member.supervisor?.fullName ?? '',
          member.supervisor?.id ?? '',
          member.maxConcurrentChats.toString(),
          member.availableForRoundRobin ? 'Yes' : 'No',
          member.isOnline ? 'Yes' : 'No',
          member.createdAt != null
              ? AppDateTime.mediumDate(member.createdAt!)
              : '',
          member.lastSeenAt != null
              ? AppDateTime.mediumDate(member.lastSeenAt!)
              : '',
        ],
      ),
    ];
    return rows.map((row) => row.map(_csvEscape).join(',')).join('\n');
  }

  String _csvEscape(String value) {
    final escaped = value.replaceAll('"', '""');
    return '"$escaped"';
  }

  // ── Actions ─────────────────────────────────────────────

  Future<void> _confirmStatusChange(SettingsTeamMemberModel m) async {
    final reactivate = m.status == 'inactive';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(reactivate ? 'Reactivate account?' : 'Deactivate account?'),
        content: Text(reactivate
            ? 'This will restore ${m.fullName} to active status.'
            : '${m.fullName} will lose access until the account is reactivated.'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: reactivate
                ? null
                : FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFEF4444)),
            child: Text(reactivate ? 'Reactivate' : 'Deactivate'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final msg = reactivate
          ? await _ds.reactivateUser(m.id)
          : await _ds.deactivateUser(m.id);
      if (!mounted) return;
      AppSnackbar.success(context, msg);
      _loadAll();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, '$e');
    }
  }

  Future<void> _confirmDeleteUser(SettingsTeamMemberModel m) async {
    if (m.id == _currentUserId) {
      AppSnackbar.error(
          context, 'You cannot permanently delete your own account.');
      return;
    }

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Account Permanently?'),
        content: Text(
            'This will permanently remove ${m.fullName} (${m.email}) from the system. This action cannot be undone.'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFEF4444)),
            child: const Text('Delete Permanently'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final msg = await _ds.deleteUserPermanent(m.id);
      if (!mounted) return;
      AppSnackbar.success(context, msg);
      _loadAll();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, '$e');
    }
  }

  Future<void> _showAccountDialog({SettingsTeamMemberModel? member}) async {
    final isEdit = member != null;
    final roles = _availableRoles();
    if (roles.isEmpty && !isEdit) {
      AppSnackbar.error(context, 'Your role cannot create new accounts.');
      return;
    }

    final nameCtrl = TextEditingController(text: member?.fullName ?? '');
    final emailCtrl = TextEditingController(text: member?.email ?? '');
    final passwordCtrl = TextEditingController();
    final chatCtrl =
        TextEditingController(text: '${member?.maxConcurrentChats ?? 10}');
    final selectedRoles = <String>{
      if (member != null) member.role else if (roles.isNotEmpty) roles.last
    };
    final selectedDeptIds = <String>{};
    if (member?.department != null) {
      selectedDeptIds.add(member!.department!.id);
    }
    String? supId = member?.supervisor?.id;
    var saving = false;
    var roundRobin = member?.availableForRoundRobin ?? true;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) {
          final theme = Theme.of(ctx);
          final showSup = selectedRoles.contains('agent');
          final eligible =
              _supervisorCandidates.where((c) => c.id != member?.id).toList();

          // Build role items for the tag selector
          final roleItems = {
            ...roles,
            if (member != null) member.role,
          }.map((r) => _RoleItem(r, _roleLabel(r))).toList();
          final editingOwnerSelf =
              member?.id == _currentUserId && member?.role == 'owner';

          return Dialog(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            child: Container(
              width: 520,
              padding: const EdgeInsets.all(28),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(isEdit ? 'Edit Account' : 'Create Account',
                        style: theme.textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    Text(
                      isEdit
                          ? 'Update role, routing, and workload settings.'
                          : 'A temporary password will be emailed to the new team member.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.5),
                      ),
                    ),
                    const SizedBox(height: 22),
                    TextField(
                      controller: nameCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Full Name',
                        prefixIcon:
                            Icon(Icons.person_outline_rounded, size: 20),
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: emailCtrl,
                      enabled: !isEdit,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: 'Email Address',
                        prefixIcon: Icon(Icons.email_outlined, size: 20),
                      ),
                    ),
                    if (!isEdit) ...[
                      const SizedBox(height: 14),
                      TextField(
                        controller: passwordCtrl,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Password',
                          hintText:
                              'Leave empty to auto-generate and send invitation email',
                          prefixIcon:
                              Icon(Icons.lock_outline_rounded, size: 20),
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),
                    Text('Role',
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    if (editingOwnerSelf)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 14),
                        decoration: BoxDecoration(
                          border: Border.all(color: theme.dividerColor),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Text('Owner'),
                      )
                    else
                      _TeamTagSelector<_RoleItem>(
                        items: roleItems,
                        selectedIds: selectedRoles,
                        labelFn: (r) => r.label,
                        idFn: (r) => r.value,
                        hintText: 'Search and add role...',
                        onChanged: (ids) => setDlg(() => selectedRoles
                          ..clear()
                          ..addAll(ids)),
                      ),
                    const SizedBox(height: 18),
                    Text('Department',
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    _TeamTagSelector(
                      items: _departments,
                      selectedIds: selectedDeptIds,
                      labelFn: (d) => d.name,
                      idFn: (d) => d.id,
                      hintText: 'Search and add department...',
                      onChanged: (ids) => setDlg(() => selectedDeptIds
                        ..clear()
                        ..addAll(ids)),
                    ),
                    if (showSup) ...[
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String?>(
                        value: supId,
                        decoration: const InputDecoration(
                          labelText: 'Supervisor',
                          prefixIcon:
                              Icon(Icons.support_agent_rounded, size: 20),
                        ),
                        items: [
                          const DropdownMenuItem<String?>(
                              value: null, child: Text('No supervisor')),
                          ...eligible.map((c) => DropdownMenuItem<String?>(
                              value: c.id, child: Text(c.fullName))),
                        ],
                        onChanged:
                            saving ? null : (v) => setDlg(() => supId = v),
                      ),
                    ],
                    const SizedBox(height: 14),
                    TextField(
                      controller: chatCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Max Concurrent Chats',
                        prefixIcon: Icon(Icons.forum_rounded, size: 20),
                      ),
                    ),
                    const SizedBox(height: 14),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Available for Round Robin'),
                      subtitle: Text(
                        'Include this member in automatic round-robin assignment',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.5),
                        ),
                      ),
                      value: roundRobin,
                      onChanged:
                          saving ? null : (v) => setDlg(() => roundRobin = v),
                    ),
                    const SizedBox(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: saving ? null : () => Navigator.pop(ctx),
                          child: const Text('Cancel'),
                        ),
                        const SizedBox(width: 12),
                        FilledButton(
                          onPressed: saving
                              ? null
                              : () async {
                                  if (nameCtrl.text.trim().isEmpty ||
                                      emailCtrl.text.trim().isEmpty) {
                                    AppSnackbar.error(
                                        ctx, 'Name and email are required.');
                                    return;
                                  }
                                  setDlg(() => saving = true);
                                  try {
                                    final deptId = selectedDeptIds.isNotEmpty
                                        ? selectedDeptIds.first
                                        : null;
                                    final roleToSave = selectedRoles.isNotEmpty
                                        ? selectedRoles.first
                                        : 'agent';
                                    if (isEdit) {
                                      await _ds.updateUser(
                                        id: member.id,
                                        fullName: nameCtrl.text.trim(),
                                        role: roleToSave,
                                        departmentId: deptId,
                                        supervisorId: showSup ? supId : null,
                                        maxConcurrentChats: int.tryParse(
                                                chatCtrl.text.trim()) ??
                                            member.maxConcurrentChats,
                                        availableForRoundRobin: roundRobin,
                                      );
                                    } else {
                                      await _ds.createAccount(
                                        email: emailCtrl.text.trim(),
                                        fullName: nameCtrl.text.trim(),
                                        role: roleToSave,
                                        departmentId: deptId,
                                        supervisorId: showSup ? supId : null,
                                        password:
                                            passwordCtrl.text.trim().isEmpty
                                                ? null
                                                : passwordCtrl.text.trim(),
                                        maxConcurrentChats: int.tryParse(
                                                chatCtrl.text.trim()) ??
                                            10,
                                        availableForRoundRobin: roundRobin,
                                      );
                                    }
                                    if (ctx.mounted) Navigator.pop(ctx);
                                    _loadAll();
                                  } catch (e) {
                                    setDlg(() => saving = false);
                                    if (ctx.mounted) {
                                      AppSnackbar.error(ctx, 'Failed: $e');
                                    }
                                  }
                                },
                          child: saving
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: Colors.white))
                              : Text(
                                  isEdit ? 'Save Changes' : 'Create Account'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
    nameCtrl.dispose();
    emailCtrl.dispose();
    passwordCtrl.dispose();
    chatCtrl.dispose();
  }
}

// ── Simple role model for tag selector ─────────────────────
class _RoleItem {
  final String value;
  final String label;
  const _RoleItem(this.value, this.label);
}

// ── Reusable Tag Selector for Team Dialog ─────────────────
class _TeamTagSelector<T> extends StatefulWidget {
  final List<T> items;
  final Set<String> selectedIds;
  final String Function(T) labelFn;
  final String Function(T) idFn;
  final String hintText;
  final ValueChanged<Set<String>> onChanged;

  const _TeamTagSelector({
    required this.items,
    required this.selectedIds,
    required this.labelFn,
    required this.idFn,
    required this.hintText,
    required this.onChanged,
  });

  @override
  State<_TeamTagSelector<T>> createState() => _TeamTagSelectorState<T>();
}

class _TeamTagSelectorState<T> extends State<_TeamTagSelector<T>> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  bool _showDropdown = false;

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final query = _controller.text.toLowerCase();
    final available = widget.items
        .where((item) => !widget.selectedIds.contains(widget.idFn(item)))
        .where((item) =>
            query.isEmpty || widget.labelFn(item).toLowerCase().contains(query))
        .toList();
    final selectedItems = widget.items
        .where((item) => widget.selectedIds.contains(widget.idFn(item)))
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (selectedItems.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: selectedItems.map((item) {
                return Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: theme.colorScheme.primary.withValues(alpha: 0.15),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        widget.labelFn(item),
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                      const SizedBox(width: 4),
                      InkWell(
                        onTap: () {
                          final ids = Set<String>.from(widget.selectedIds);
                          ids.remove(widget.idFn(item));
                          widget.onChanged(ids);
                        },
                        child: Icon(Icons.close_rounded,
                            size: 14, color: theme.colorScheme.primary),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
        TextField(
          controller: _controller,
          focusNode: _focusNode,
          onChanged: (_) => setState(() => _showDropdown = true),
          onTap: () => setState(() => _showDropdown = true),
          decoration: InputDecoration(
            hintText: widget.hintText,
            isDense: true,
            prefixIcon: const Icon(Icons.search_rounded, size: 18),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide:
                  BorderSide(color: theme.dividerColor.withValues(alpha: 0.3)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide:
                  BorderSide(color: theme.dividerColor.withValues(alpha: 0.3)),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
        ),
        if (_showDropdown && available.isNotEmpty)
          Container(
            constraints: const BoxConstraints(maxHeight: 160),
            margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(10),
              border:
                  Border.all(color: theme.dividerColor.withValues(alpha: 0.2)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: ListView.builder(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              itemCount: available.length,
              itemBuilder: (_, i) {
                final item = available[i];
                return InkWell(
                  onTap: () {
                    final ids = Set<String>.from(widget.selectedIds);
                    ids.add(widget.idFn(item));
                    widget.onChanged(ids);
                    _controller.clear();
                    setState(() => _showDropdown = false);
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 10),
                    child: Text(
                      widget.labelFn(item),
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                );
              },
            ),
          ),
      ],
    );
  }
}
