import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:simpulx/core/theme/app_style.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/features/audit_log/data/datasources/audit_log_remote_datasource.dart';
import 'package:simpulx/features/audit_log/data/models/audit_log_models.dart';
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/features/settings/data/datasources/settings_remote_datasource.dart';
import 'package:simpulx/features/settings/data/models/settings_models.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  int _selectedSection = 0;

  late final SettingsRemoteDataSource _settingsRemoteDataSource;
  late final AuditLogRemoteDataSource _auditLogRemoteDataSource;
  final _teamSearchController = TextEditingController();
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _dateFormat = DateFormat('dd MMM yyyy, HH:mm');

  bool _isLoadingDepartments = false;
  String? _departmentsError;
  List<SettingsDepartmentModel> _departments = const [];

  bool _isLoadingTeam = false;
  String? _teamError;
  List<SettingsTeamMemberModel> _teamMembers = const [];
  List<SettingsTeamMemberModel> _supervisorCandidates = const [];
  int _teamPage = 1;
  int _teamLimit = 10;
  int _teamTotal = 0;
  int _teamTotalPages = 1;
  String? _teamRoleFilter;
  String? _teamStatusFilter;

  bool _isLoadingChannels = false;
  String? _channelsError;
  List<Map<String, dynamic>> _channels = const [];

  bool _isChangingPassword = false;
  bool _isLoadingAuditLogs = false;
  String? _auditLogsError;
  List<AuditLogModel> _recentAuditLogs = const [];

  final _sections = const [
    _SettingsSection('Profile', Icons.person_rounded),
    _SettingsSection('Organization', Icons.business_rounded),
    _SettingsSection('Departments', Icons.account_tree_rounded),
    _SettingsSection('WhatsApp', Icons.chat_rounded),
    _SettingsSection('Team', Icons.group_rounded),
    _SettingsSection('Notifications', Icons.notifications_rounded),
    _SettingsSection('Security', Icons.security_rounded),
  ];

  @override
  void initState() {
    super.initState();
    _settingsRemoteDataSource = di.sl<SettingsRemoteDataSource>();
    _auditLogRemoteDataSource = di.sl<AuditLogRemoteDataSource>();
    _loadDepartments();
    _loadTeamMembers();
    _loadSupervisorCandidates();
    _loadRecentAuditLogs();
    _loadChannels();
  }

  @override
  void dispose() {
    _teamSearchController.dispose();
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  AuthAuthenticated? get _authState {
    final state = context.read<AuthBloc>().state;
    return state is AuthAuthenticated ? state : null;
  }

  String get _currentUserRole => _authState?.session.user.role ?? 'agent';

  String get _currentUserId => _authState?.session.user.id ?? '';

  bool get _canManageAccounts => _roleLevel(_currentUserRole) >= 3;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isWide = MediaQuery.of(context).size.width >= 900;

    return Scaffold(
      body: isWide
          ? Row(
              children: [
                SizedBox(width: 260, child: _buildSectionList(context)),
                VerticalDivider(width: 1, color: theme.dividerColor),
                Expanded(child: _buildContent(context)),
              ],
            )
          : Column(
              children: [
                _buildSectionChips(context),
                Expanded(child: _buildContent(context)),
              ],
            ),
    );
  }

  Widget _buildSectionList(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      color: theme.colorScheme.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Settings',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          ..._sections.asMap().entries.map((entry) {
            final index = entry.key;
            final section = entry.value;
            final isSelected = _selectedSection == index;

            return ListTile(
              leading: Icon(
                section.icon,
                color: isSelected
                    ? theme.colorScheme.primary
                    : theme.colorScheme.onSurface.withOpacity(0.5),
                size: 22,
              ),
              title: Text(
                section.label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                  color: isSelected
                      ? theme.colorScheme.primary
                      : theme.colorScheme.onSurface.withOpacity(0.8),
                ),
              ),
              selected: isSelected,
              selectedTileColor: theme.colorScheme.primary.withOpacity(0.08),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 20,
                vertical: 2,
              ),
              onTap: () => setState(() => _selectedSection = index),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildSectionChips(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(bottom: BorderSide(color: theme.dividerColor)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Settings',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _sections.asMap().entries.map((entry) {
                final isSelected = _selectedSection == entry.key;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(
                      entry.value.label,
                      style: TextStyle(
                        fontSize: 12,
                        color: isSelected
                            ? Colors.white
                            : theme.colorScheme.onSurface.withOpacity(0.7),
                      ),
                    ),
                    avatar: Icon(
                      entry.value.icon,
                      size: 16,
                      color: isSelected
                          ? Colors.white
                          : theme.colorScheme.onSurface.withOpacity(0.5),
                    ),
                    selected: isSelected,
                    selectedColor: theme.colorScheme.primary,
                    showCheckmark: false,
                    onSelected: (_) =>
                        setState(() => _selectedSection = entry.key),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    switch (_selectedSection) {
      case 0:
        return _buildProfileSection(context);
      case 1:
        return _buildOrgSection(context);
      case 2:
        return _buildDepartmentsSection(context);
      case 3:
        return _buildWhatsAppSection(context);
      case 4:
        return _buildTeamSection(context);
      case 5:
        return _buildNotificationsSection(context);
      case 6:
        return _buildSecuritySection(context);
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildProfileSection(BuildContext context) {
    final theme = Theme.of(context);
    final session = _authState?.session;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Profile',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Your current identity, role, and workspace access.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withOpacity(0.5),
            ),
          ),
          const SizedBox(height: 28),
          Center(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 48,
                  backgroundColor: theme.colorScheme.primary.withOpacity(0.18),
                  child: Text(
                    (session?.user.fullName.isNotEmpty ?? false)
                        ? session!.user.fullName[0].toUpperCase()
                        : '?',
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                _buildBadge(
                  context,
                  label: _roleLabel(session?.user.role ?? 'agent'),
                  color: _roleColor(context, session?.user.role ?? 'agent'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _buildSettingsCard(
            context,
            [
              _buildReadOnlyField(
                label: 'Full Name',
                value: session?.user.fullName ?? 'Not available',
              ),
              _buildReadOnlyField(
                label: 'Email Address',
                value: session?.user.email ?? 'Not available',
              ),
              _buildReadOnlyField(
                label: 'Role',
                value: _roleLabel(session?.user.role ?? 'agent'),
              ),
              _buildReadOnlyField(
                label: 'Workspace',
                value: session?.organization.name ?? 'Not available',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildOrgSection(BuildContext context) {
    final theme = Theme.of(context);
    final session = _authState?.session;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Organization',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Core organization details detected from your current session.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withOpacity(0.5),
            ),
          ),
          const SizedBox(height: 28),
          _buildSettingsCard(
            context,
            [
              _buildReadOnlyField(
                label: 'Organization Name',
                value: session?.organization.name ?? 'Not available',
              ),
              _buildReadOnlyField(
                label: 'Workspace Slug',
                value: session?.organization.slug ?? 'Not available',
              ),
              _buildReadOnlyField(
                label: 'Plan',
                value: session?.organization.plan ?? 'Not available',
              ),
              _buildReadOnlyField(
                label: 'API Base URL',
                value: 'https://app.simpulx.com/api/v1',
              ),
            ],
          ),
          const SizedBox(height: 16),
          _buildInfoPanel(
            context,
            icon: Icons.info_outline_rounded,
            iconColor: theme.colorScheme.primary,
            title: 'Editable organization settings can come next',
            description:
                'The live session values are wired in now. If you want, we can make this section editable after the account-management flow.',
          ),
        ],
      ),
    );
  }

  Widget _buildDepartmentsSection(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(28),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border(bottom: BorderSide(color: theme.dividerColor)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Departments',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${_departments.length} active departments loaded from the API.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withOpacity(0.5),
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: _loadDepartments,
                tooltip: 'Refresh',
                icon: const Icon(Icons.refresh_rounded),
              ),
              if (_canManageAccounts) ...[
                const SizedBox(width: 8),
                ElevatedButton.icon(
                  onPressed: () => _showDepartmentDialog(),
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('Add Department'),
                ),
              ],
            ],
          ),
        ),
        Expanded(
          child: Builder(
            builder: (context) {
              if (_isLoadingDepartments && _departments.isEmpty) {
                return const Center(child: CircularProgressIndicator());
              }

              if (_departmentsError != null && _departments.isEmpty) {
                return _buildStateMessage(
                  context,
                  icon: Icons.wifi_off_rounded,
                  title: 'Could not load departments',
                  description: _departmentsError!,
                  actionLabel: 'Retry',
                  onAction: _loadDepartments,
                );
              }

              if (_departments.isEmpty) {
                return _buildStateMessage(
                  context,
                  icon: Icons.account_tree_rounded,
                  title: 'No departments yet',
                  description:
                      'Create departments to organize teams by branch, brand, or workflow.',
                  actionLabel: _canManageAccounts ? 'Create Department' : null,
                  onAction:
                      _canManageAccounts ? () => _showDepartmentDialog() : null,
                );
              }

              return ListView.separated(
                padding: const EdgeInsets.all(28),
                itemCount: _departments.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final department = _departments[index];
                  return Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surface,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: theme.dividerColor),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF59E0B).withOpacity(0.12),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(
                            Icons.account_tree_rounded,
                            color: Color(0xFFF59E0B),
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      department.name,
                                      style:
                                          theme.textTheme.titleMedium?.copyWith(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                  _buildBadge(
                                    context,
                                    label: 'Active',
                                    color: const Color(0xFF25D366),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                department.description?.trim().isNotEmpty ==
                                        true
                                    ? department.description!
                                    : 'No description added yet.',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.onSurface
                                      .withOpacity(0.68),
                                  height: 1.45,
                                ),
                              ),
                              const SizedBox(height: 14),
                              Wrap(
                                spacing: 10,
                                runSpacing: 10,
                                children: [
                                  _buildMetaChip(
                                    context,
                                    icon: Icons.calendar_today_rounded,
                                    label:
                                        'Created ${_formatDateShort(department.createdAt)}',
                                  ),
                                  _buildMetaChip(
                                    context,
                                    icon: Icons.route_rounded,
                                    label: 'Ready for channel routing',
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        if (_canManageAccounts) ...[
                          const SizedBox(width: 8),
                          IconButton(
                            onPressed: () => _showDepartmentDialog(
                              department: department,
                            ),
                            tooltip: 'Edit department',
                            icon: const Icon(Icons.edit_rounded),
                          ),
                        ],
                      ],
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildWhatsAppSection(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(28),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border(bottom: BorderSide(color: theme.dividerColor)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('WhatsApp Channels',
                            style: theme.textTheme.titleLarge
                                ?.copyWith(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 6),
                        Text(
                          '${_channels.length} channel(s) configured. Manage your WhatsApp Cloud API connections.',
                          style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.5)),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                      onPressed: _loadChannels,
                      tooltip: 'Refresh',
                      icon: const Icon(Icons.refresh_rounded)),
                  if (_canManageAccounts) ...[
                    const SizedBox(width: 8),
                    ElevatedButton.icon(
                      onPressed: () => _showChannelDialog(),
                      icon: const Icon(Icons.add_rounded, size: 18),
                      label: const Text('Connect Channel'),
                      style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF25D366)),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 16),
              _buildSettingsCard(context, [
                _buildReadOnlyField(
                    label: 'Webhook URL',
                    value: 'https://app.simpulx.com/api/v1/webhook/whatsapp'),
                _buildReadOnlyField(label: 'Environment', value: 'Production'),
              ]),
            ],
          ),
        ),
        Expanded(
          child: Builder(
            builder: (context) {
              if (_isLoadingChannels && _channels.isEmpty) {
                return const Center(child: CircularProgressIndicator());
              }
              if (_channelsError != null && _channels.isEmpty) {
                return _buildStateMessage(context,
                    icon: Icons.wifi_off_rounded,
                    title: 'Could not load channels',
                    description: _channelsError!,
                    actionLabel: 'Retry',
                    onAction: _loadChannels);
              }
              if (_channels.isEmpty) {
                return _buildStateMessage(context,
                    icon: Icons.chat_rounded,
                    title: 'No WhatsApp channels connected',
                    description:
                        'Connect your first WhatsApp Cloud API channel to start receiving messages.',
                    actionLabel: _canManageAccounts ? 'Connect Channel' : null,
                    onAction:
                        _canManageAccounts ? () => _showChannelDialog() : null);
              }
              return ListView.separated(
                padding: const EdgeInsets.all(28),
                itemCount: _channels.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final ch = _channels[index];
                  final status = ch['status'] ?? 'disconnected';
                  final statusColor = status == 'connected'
                      ? const Color(0xFF25D366)
                      : status == 'pending'
                          ? const Color(0xFFF59E0B)
                          : const Color(0xFFEF4444);
                  final deptName = ch['department']?['name'];
                  return Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surface,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: theme.dividerColor),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color:
                                const Color(0xFF25D366).withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(Icons.chat_rounded,
                              color: Color(0xFF25D366), size: 22),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                      child: Text(ch['name'] ?? 'Unnamed',
                                          style: theme.textTheme.titleMedium
                                              ?.copyWith(
                                                  fontWeight:
                                                      FontWeight.w700))),
                                  _buildBadge(context,
                                      label: status.toString().toUpperCase(),
                                      color: statusColor),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 10,
                                runSpacing: 10,
                                children: [
                                  _buildMetaChip(context,
                                      icon: Icons.phone_rounded,
                                      label: ch['phoneNumber'] ?? 'N/A'),
                                  _buildMetaChip(context,
                                      icon: Icons.fingerprint_rounded,
                                      label:
                                          'ID: ${ch['phoneNumberId'] ?? 'N/A'}'),
                                  if (deptName != null)
                                    _buildMetaChip(context,
                                        icon: Icons.account_tree_rounded,
                                        label: deptName),
                                  if (ch['isActive'] == false)
                                    _buildMetaChip(context,
                                        icon: Icons.pause_circle_rounded,
                                        label: 'Inactive'),
                                ],
                              ),
                            ],
                          ),
                        ),
                        if (_canManageAccounts) ...[
                          const SizedBox(width: 8),
                          IconButton(
                            onPressed: () => _testChannel(ch['id']),
                            tooltip: 'Test Connection',
                            icon: Icon(Icons.wifi_find_rounded,
                                color: theme.colorScheme.primary, size: 20),
                          ),
                          IconButton(
                            onPressed: () => _showChannelDialog(channel: ch),
                            tooltip: 'Edit',
                            icon: Icon(Icons.edit_rounded,
                                size: 20,
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.5)),
                          ),
                          IconButton(
                            onPressed: () =>
                                _deleteChannel(ch['id'], ch['name'] ?? ''),
                            tooltip: 'Remove',
                            icon: Icon(Icons.delete_outline_rounded,
                                size: 20, color: theme.colorScheme.error),
                          ),
                        ],
                      ],
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildTeamSection(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(28),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border(bottom: BorderSide(color: theme.dividerColor)),
          ),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final isNarrow = constraints.maxWidth < 900;

              final searchField = SizedBox(
                width: isNarrow ? double.infinity : 320,
                child: TextField(
                  controller: _teamSearchController,
                  onSubmitted: (_) => _loadTeamMembers(page: 1),
                  decoration: InputDecoration(
                    hintText: 'Search name or email...',
                    prefixIcon: const Icon(Icons.search_rounded, size: 20),
                    suffixIcon: IconButton(
                      onPressed: () => _loadTeamMembers(page: 1),
                      icon: const Icon(Icons.arrow_forward_rounded, size: 18),
                    ),
                    isDense: true,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                  ),
                ),
              );

              final roleFilter = SizedBox(
                width: isNarrow ? double.infinity : 170,
                child: _buildFilterDropdown(
                  context,
                  value: _teamRoleFilter,
                  label: 'Role',
                  items: const [
                    DropdownMenuItem(value: null, child: Text('All roles')),
                    DropdownMenuItem(value: 'admin', child: Text('Admin')),
                    DropdownMenuItem(value: 'manager', child: Text('Manager')),
                    DropdownMenuItem(
                      value: 'supervisor',
                      child: Text('Supervisor'),
                    ),
                    DropdownMenuItem(value: 'agent', child: Text('Agent')),
                  ],
                  onChanged: (value) {
                    setState(() => _teamRoleFilter = value);
                    _loadTeamMembers(page: 1);
                  },
                ),
              );

              final statusFilter = SizedBox(
                width: isNarrow ? double.infinity : 180,
                child: _buildFilterDropdown(
                  context,
                  value: _teamStatusFilter,
                  label: 'Status',
                  items: const [
                    DropdownMenuItem(value: null, child: Text('All statuses')),
                    DropdownMenuItem(value: 'active', child: Text('Active')),
                    DropdownMenuItem(value: 'invited', child: Text('Invited')),
                    DropdownMenuItem(
                      value: 'inactive',
                      child: Text('Inactive'),
                    ),
                  ],
                  onChanged: (value) {
                    setState(() => _teamStatusFilter = value);
                    _loadTeamMembers(page: 1);
                  },
                ),
              );

              final actions = Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    onPressed: _refreshTeamData,
                    tooltip: 'Refresh',
                    icon: const Icon(Icons.refresh_rounded),
                  ),
                  if (_canManageAccounts) ...[
                    const SizedBox(width: 8),
                    ElevatedButton.icon(
                      onPressed: () => _showAccountDialog(),
                      icon: const Icon(Icons.person_add_rounded, size: 18),
                      label: const Text('Create Account'),
                    ),
                  ],
                ],
              );

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    alignment: WrapAlignment.spaceBetween,
                    children: [
                      SizedBox(
                        width: isNarrow
                            ? constraints.maxWidth
                            : constraints.maxWidth - 240,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Team Management',
                              style: theme.textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              '$_teamTotal accounts found. Manage roles, statuses, departments, and supervisor assignments.',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.onSurface
                                    .withOpacity(0.5),
                              ),
                            ),
                          ],
                        ),
                      ),
                      actions,
                    ],
                  ),
                  const SizedBox(height: 18),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      searchField,
                      roleFilter,
                      statusFilter,
                    ],
                  ),
                  const SizedBox(height: 20),
                  LayoutBuilder(
                    builder: (context, innerConstraints) {
                      final isCompact = innerConstraints.maxWidth < 980;
                      if (isCompact) {
                        return Column(
                          children: [
                            _buildPermissionMatrixCard(context),
                            const SizedBox(height: 12),
                            _buildRecentAuditCard(context),
                          ],
                        );
                      }

                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: _buildPermissionMatrixCard(context),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _buildRecentAuditCard(context),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              );
            },
          ),
        ),
        Expanded(
          child: Builder(
            builder: (context) {
              if (_isLoadingTeam && _teamMembers.isEmpty) {
                return const Center(child: CircularProgressIndicator());
              }

              if (_teamError != null && _teamMembers.isEmpty) {
                return _buildStateMessage(
                  context,
                  icon: Icons.wifi_off_rounded,
                  title: 'Could not load team members',
                  description: _teamError!,
                  actionLabel: 'Retry',
                  onAction: _loadTeamMembers,
                );
              }

              if (_teamMembers.isEmpty) {
                return _buildStateMessage(
                  context,
                  icon: Icons.group_rounded,
                  title: 'No team members match these filters',
                  description:
                      'Try clearing the search or create the first account for this workspace.',
                  actionLabel: _canManageAccounts ? 'Create Account' : null,
                  onAction:
                      _canManageAccounts ? () => _showAccountDialog() : null,
                );
              }

              return Column(
                children: [
                  if (_teamError != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(28, 16, 28, 0),
                      child: _buildInlineError(context, _teamError!),
                    ),
                  Expanded(
                    child: ListView.separated(
                      padding: const EdgeInsets.all(28),
                      itemCount: _teamMembers.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final member = _teamMembers[index];
                        final canManage = _canManageMember(member);
                        return Container(
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.surface,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: theme.dividerColor),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  CircleAvatar(
                                    radius: 24,
                                    backgroundColor: theme.colorScheme.primary
                                        .withOpacity(0.18),
                                    child: Text(
                                      member.fullName.isNotEmpty
                                          ? member.fullName[0].toUpperCase()
                                          : '?',
                                      style: TextStyle(
                                        color: theme.colorScheme.primary,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          member.fullName,
                                          style: theme.textTheme.titleMedium
                                              ?.copyWith(
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          member.email,
                                          style: theme.textTheme.bodySmall
                                              ?.copyWith(
                                            color: theme.colorScheme.onSurface
                                                .withOpacity(0.62),
                                          ),
                                        ),
                                        const SizedBox(height: 12),
                                        Wrap(
                                          spacing: 8,
                                          runSpacing: 8,
                                          children: [
                                            _buildBadge(
                                              context,
                                              label: _roleLabel(member.role),
                                              color: _roleColor(
                                                context,
                                                member.role,
                                              ),
                                            ),
                                            _buildBadge(
                                              context,
                                              label:
                                                  _statusLabel(member.status),
                                              color: _statusColor(
                                                context,
                                                member.status,
                                              ),
                                            ),
                                            if (member.isOnline)
                                              _buildBadge(
                                                context,
                                                label: 'Online now',
                                                color: const Color(0xFF25D366),
                                              ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                  if (canManage)
                                    PopupMenuButton<String>(
                                      tooltip: 'Actions',
                                      onSelected: (value) {
                                        if (value == 'edit') {
                                          _showAccountDialog(member: member);
                                        }
                                        if (value == 'status') {
                                          _confirmStatusChange(member);
                                        }
                                      },
                                      itemBuilder: (context) => [
                                        const PopupMenuItem(
                                          value: 'edit',
                                          child: Text('Edit account'),
                                        ),
                                        PopupMenuItem(
                                          value: 'status',
                                          child: Text(
                                            member.status == 'inactive'
                                                ? 'Reactivate account'
                                                : 'Deactivate account',
                                          ),
                                        ),
                                      ],
                                    ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              Wrap(
                                spacing: 10,
                                runSpacing: 10,
                                children: [
                                  _buildMetaChip(
                                    context,
                                    icon: Icons.account_tree_rounded,
                                    label: member.department?.name ??
                                        'No department',
                                  ),
                                  _buildMetaChip(
                                    context,
                                    icon: Icons.support_agent_rounded,
                                    label: member.supervisor?.fullName ??
                                        'No supervisor',
                                  ),
                                  _buildMetaChip(
                                    context,
                                    icon: Icons.forum_rounded,
                                    label:
                                        'Max ${member.maxConcurrentChats} chats',
                                  ),
                                  _buildMetaChip(
                                    context,
                                    icon: Icons.schedule_rounded,
                                    label:
                                        'Last seen ${_formatDateShort(member.lastSeenAt)}',
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                  if (_teamTotalPages > 1) _buildTeamPaginationBar(context),
                ],
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildNotificationsSection(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Notifications',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Notification preferences are still local placeholders for now.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withOpacity(0.5),
            ),
          ),
          const SizedBox(height: 28),
          _buildSettingsCard(
            context,
            [
              _buildSwitchTile('New message notifications', true),
              _buildSwitchTile('New conversation alerts', true),
              _buildSwitchTile('Email digest (daily)', false),
              _buildSwitchTile('Sound notifications', true),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSecuritySection(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Security',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Change the current account password using the live backend endpoint.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withOpacity(0.5),
            ),
          ),
          const SizedBox(height: 28),
          _buildSettingsCard(
            context,
            [
              _buildPasswordField(
                controller: _currentPasswordController,
                label: 'Current Password',
              ),
              _buildPasswordField(
                controller: _newPasswordController,
                label: 'New Password',
                helperText:
                    'Minimum 8 characters, 1 uppercase letter, 1 number',
              ),
              _buildPasswordField(
                controller: _confirmPasswordController,
                label: 'Confirm New Password',
              ),
            ],
          ),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerRight,
            child: ElevatedButton(
              onPressed: _isChangingPassword ? null : _changePassword,
              child: _isChangingPassword
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Update Password'),
            ),
          ),
          const SizedBox(height: 32),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border:
                  Border.all(color: const Color(0xFFEF4444).withOpacity(0.3)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Danger Zone',
                        style: TextStyle(
                          color: const Color(0xFFEF4444),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Account deletion is intentionally disabled here for safety.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface.withOpacity(0.5),
                        ),
                      ),
                    ],
                  ),
                ),
                OutlinedButton(
                  onPressed: null,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFEF4444),
                    side: const BorderSide(color: const Color(0xFFEF4444)),
                  ),
                  child: const Text('Delete Account'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTeamPaginationBar(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(top: BorderSide(color: theme.dividerColor)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            onPressed: _teamPage > 1
                ? () => _loadTeamMembers(page: _teamPage - 1)
                : null,
            icon: const Icon(Icons.chevron_left_rounded),
            iconSize: 20,
          ),
          ...List.generate(_teamTotalPages > 7 ? 7 : _teamTotalPages, (index) {
            int pageNumber;
            if (_teamTotalPages <= 7) {
              pageNumber = index + 1;
            } else if (_teamPage <= 4) {
              pageNumber = index + 1;
            } else if (_teamPage >= _teamTotalPages - 3) {
              pageNumber = _teamTotalPages - 6 + index;
            } else {
              pageNumber = _teamPage - 3 + index;
            }

            final isCurrent = pageNumber == _teamPage;
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap:
                    isCurrent ? null : () => _loadTeamMembers(page: pageNumber),
                child: Container(
                  width: 36,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: isCurrent
                        ? theme.colorScheme.primary
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '$pageNumber',
                    style: TextStyle(
                      color: isCurrent
                          ? Colors.white
                          : theme.colorScheme.onSurface.withOpacity(0.6),
                      fontWeight:
                          isCurrent ? FontWeight.w700 : FontWeight.normal,
                    ),
                  ),
                ),
              ),
            );
          }),
          IconButton(
            onPressed: _teamPage < _teamTotalPages
                ? () => _loadTeamMembers(page: _teamPage + 1)
                : null,
            icon: const Icon(Icons.chevron_right_rounded),
            iconSize: 20,
          ),
          const SizedBox(width: 14),
          Text(
            'Page $_teamPage of $_teamTotalPages',
            style: TextStyle(
              fontSize: 12,
              color: theme.colorScheme.onSurface.withOpacity(0.45),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterDropdown(
    BuildContext context, {
    required String? value,
    required String label,
    required List<DropdownMenuItem<String?>> items,
    required ValueChanged<String?> onChanged,
  }) {
    return DropdownButtonFormField<String?>(
      value: value,
      decoration: InputDecoration(
        labelText: label,
        isDense: true,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 10,
        ),
      ),
      items: items,
      onChanged: onChanged,
    );
  }

  Widget _buildSettingsCard(BuildContext context, List<Widget> children) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        children: children
            .expand((child) => [child, const SizedBox(height: 16)])
            .toList()
          ..removeLast(),
      ),
    );
  }

  Widget _buildStateMessage(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String description,
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    final theme = Theme.of(context);
    return Center(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 460),
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: theme.dividerColor),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(
                icon,
                size: 34,
                color: theme.colorScheme.primary,
              ),
            ),
            const SizedBox(height: 18),
            Text(
              title,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              description,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withOpacity(0.6),
                height: 1.45,
              ),
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 18),
              ElevatedButton(
                onPressed: onAction,
                child: Text(actionLabel),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildInlineError(BuildContext context, String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFEF4444).withOpacity(0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.18)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded,
              color: const Color(0xFFEF4444)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: const Color(0xFFEF4444)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoPanel(
    BuildContext context, {
    required IconData icon,
    required Color iconColor,
    required String title,
    required String description,
  }) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: iconColor),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withOpacity(0.62),
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildReadOnlyField({
    required String label,
    required String value,
  }) =>
      TextFormField(
        initialValue: value,
        readOnly: true,
        decoration: InputDecoration(labelText: label),
      );

  Widget _buildPasswordField({
    required TextEditingController controller,
    required String label,
    String? helperText,
  }) =>
      TextField(
        controller: controller,
        obscureText: true,
        decoration: InputDecoration(labelText: label, helperText: helperText),
      );

  Widget _buildSwitchTile(String label, bool initial) {
    return StatefulBuilder(
      builder: (context, setInnerState) {
        var value = initial;
        return SwitchListTile(
          title: Text(label, style: const TextStyle(fontSize: 14)),
          value: value,
          onChanged: (next) => setInnerState(() => value = next),
          contentPadding: EdgeInsets.zero,
        );
      },
    );
  }

  Widget _buildBadge(
    BuildContext context, {
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
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

  Widget _buildMetaChip(
    BuildContext context, {
    required IconData icon,
    required String label,
  }) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary.withOpacity(0.06),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 15,
            color: theme.colorScheme.primary.withOpacity(0.8),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: theme.colorScheme.onSurface.withOpacity(0.72),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPermissionMatrixCard(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.verified_user_rounded,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Permission Matrix',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'The current hierarchy and what each role is expected to manage.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withOpacity(0.58),
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _buildPermissionRoleCard(
                context,
                role: 'Owner',
                accent: const Color(0xFFE17055),
                summary: 'Full account control and top-level org ownership.',
                capabilities: const [
                  'Billing and org settings',
                  'All teams and analytics',
                  'Highest access level',
                ],
              ),
              _buildPermissionRoleCard(
                context,
                role: 'Manager',
                accent: const Color(0xFF10B981),
                summary: 'Operational control over teams and workspace setup.',
                capabilities: const [
                  'Team management',
                  'Department configuration',
                  'Analytics visibility',
                ],
              ),
              _buildPermissionRoleCard(
                context,
                role: 'Supervisor',
                accent: const Color(0xFFF59E0B),
                summary: 'Guides assigned agents and monitors their workload.',
                capabilities: const [
                  'Assigned agent oversight',
                  'Agent chat visibility',
                  'No manager-level config',
                ],
              ),
              _buildPermissionRoleCard(
                context,
                role: 'Agent',
                accent: theme.colorScheme.primary,
                summary: 'Handles day-to-day customer conversations.',
                capabilities: const [
                  'Own chats and contacts',
                  'Quick replies',
                  'Limited administrative access',
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPermissionRoleCard(
    BuildContext context, {
    required String role,
    required Color accent,
    required String summary,
    required List<String> capabilities,
  }) {
    final theme = Theme.of(context);
    final isCurrentRole = _roleLabel(_currentUserRole) == role;

    return Container(
      width: 210,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: accent.withOpacity(0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isCurrentRole
              ? accent.withOpacity(0.6)
              : accent.withOpacity(0.18),
          width: isCurrentRole ? 1.4 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                role,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: accent,
                ),
              ),
              if (isCurrentRole) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: accent.withOpacity(0.16),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    'Current',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: accent,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Text(
            summary,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withOpacity(0.68),
              height: 1.4,
            ),
          ),
          const SizedBox(height: 10),
          ...capabilities.map(
            (capability) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.check_circle_rounded, size: 14, color: accent),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      capability,
                      style: TextStyle(
                        fontSize: 12,
                        color: theme.colorScheme.onSurface.withOpacity(0.72),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecentAuditCard(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.history_rounded, color: theme.colorScheme.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Recent Access Activity',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              TextButton(
                onPressed: () => context.go('/audit-log'),
                child: const Text('Open Full Log'),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Recent user, auth, and settings changes related to account management.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withOpacity(0.58),
            ),
          ),
          const SizedBox(height: 14),
          if (_isLoadingAuditLogs && _recentAuditLogs.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_auditLogsError != null && _recentAuditLogs.isEmpty)
            _buildInlineError(context, _auditLogsError!)
          else if (_recentAuditLogs.isEmpty)
            Text(
              'No recent account-related audit activity yet.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withOpacity(0.56),
              ),
            )
          else
            Column(
              children: _recentAuditLogs
                  .take(5)
                  .map(
                    (log) => Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withOpacity(0.05),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            margin: const EdgeInsets.only(top: 2),
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: _statusColor(context, 'active'),
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _buildAuditHeadline(log),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 12,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  _buildAuditDetail(log),
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurface
                                        .withOpacity(0.58),
                                    height: 1.4,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            _formatDateShort(log.createdAt),
                            style: TextStyle(
                              fontSize: 11,
                              color:
                                  theme.colorScheme.onSurface.withOpacity(0.42),
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                  .toList(),
            ),
        ],
      ),
    );
  }

  Future<void> _loadDepartments() async {
    setState(() {
      _isLoadingDepartments = true;
      _departmentsError = null;
    });

    try {
      final departments = await _settingsRemoteDataSource.getDepartments();
      if (!mounted) return;
      setState(() {
        _departments = departments;
        _isLoadingDepartments = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _departmentsError = _formatError(error);
        _isLoadingDepartments = false;
      });
    }
  }

  Future<void> _loadTeamMembers({int? page}) async {
    final targetPage = page ?? _teamPage;

    setState(() {
      _isLoadingTeam = true;
      _teamError = null;
    });

    try {
      final response = await _settingsRemoteDataSource.getUsers(
        search: _teamSearchController.text,
        role: _teamRoleFilter,
        status: _teamStatusFilter,
        page: targetPage,
        limit: _teamLimit,
      );

      if (!mounted) return;

      setState(() {
        _teamMembers = response.users;
        _teamPage = response.page;
        _teamLimit = response.limit;
        _teamTotal = response.total;
        _teamTotalPages = response.totalPages < 1 ? 1 : response.totalPages;
        _isLoadingTeam = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _teamError = _formatError(error);
        _isLoadingTeam = false;
      });
    }
  }

  Future<void> _loadSupervisorCandidates() async {
    try {
      final response = await _settingsRemoteDataSource.getUsers(
        page: 1,
        limit: 200,
        status: 'active',
      );

      if (!mounted) return;

      setState(() {
        _supervisorCandidates = response.users
            .where(
              (user) => user.role == 'manager' || user.role == 'supervisor',
            )
            .toList();
      });
    } catch (_) {
      // Best-effort data for dropdowns; ignore errors here.
    }
  }

  Future<void> _loadRecentAuditLogs() async {
    setState(() {
      _isLoadingAuditLogs = true;
      _auditLogsError = null;
    });

    try {
      final response = await _auditLogRemoteDataSource.getAuditLogs(limit: 25);
      final relevantLogs = response.logs
          .where((log) {
            return log.category == 'user' ||
                log.category == 'settings' ||
                log.category == 'auth';
          })
          .take(6)
          .toList();

      if (!mounted) return;

      setState(() {
        _recentAuditLogs = relevantLogs;
        _isLoadingAuditLogs = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _auditLogsError = _formatError(error);
        _isLoadingAuditLogs = false;
      });
    }
  }

  Future<void> _loadChannels() async {
    setState(() {
      _isLoadingChannels = true;
      _channelsError = null;
    });
    try {
      final dio = di.sl<DioClient>().dio;
      final response = await dio.get(ApiConstants.channels);
      final data = response.data;
      if (!mounted) return;
      setState(() {
        _channels = data is List
            ? List<Map<String, dynamic>>.from(data)
            : List<Map<String, dynamic>>.from(data['data'] ?? []);
        _isLoadingChannels = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _channelsError = _formatError(error);
        _isLoadingChannels = false;
      });
    }
  }

  Future<void> _testChannel(String id) async {
    try {
      final dio = di.sl<DioClient>().dio;
      final response = await dio.post(ApiConstants.channelTest(id));
      final status = response.data['status'] ?? 'unknown';
      if (!mounted) return;
      if (status == 'connected') {
        _showSuccess(
            'Channel connected successfully! Quality: ${response.data['qualityRating'] ?? 'N/A'}');
      } else {
        _showError(
            'Connection failed: ${response.data['message'] ?? 'Unknown error'}');
      }
      await _loadChannels();
    } catch (error) {
      _showError(_formatError(error));
    }
  }

  Future<void> _deleteChannel(String id, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove Channel'),
        content: Text(
            'Are you sure you want to remove "$name"? This cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Remove', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final dio = di.sl<DioClient>().dio;
      await dio.delete(ApiConstants.channel(id));
      _showSuccess('Channel removed.');
      await _loadChannels();
    } catch (error) {
      _showError(_formatError(error));
    }
  }

  Future<void> _showChannelDialog({Map<String, dynamic>? channel}) async {
    final isEditing = channel != null;
    final theme = Theme.of(context);
    final nameCtrl = TextEditingController(text: channel?['name'] ?? '');
    final phoneCtrl =
        TextEditingController(text: channel?['phoneNumber'] ?? '');
    final phoneIdCtrl =
        TextEditingController(text: channel?['phoneNumberId'] ?? '');
    final businessIdCtrl =
        TextEditingController(text: channel?['businessAccountId'] ?? '');
    final tokenCtrl =
        TextEditingController(text: channel?['accessToken'] ?? '');
    String? selectedDeptId =
        channel?['departmentId'] ?? channel?['department']?['id'];
    var isSaving = false;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => Dialog(
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
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color:
                              const Color(0xFF25D366).withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.chat_rounded,
                            color: Color(0xFF25D366), size: 22),
                      ),
                      const SizedBox(width: 14),
                      Text(
                        isEditing ? 'Edit Channel' : 'Connect WhatsApp Channel',
                        style: theme.textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Enter your Meta WhatsApp Cloud API credentials.',
                    style: theme.textTheme.bodySmall?.copyWith(
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                  ),
                  const SizedBox(height: 24),
                  TextField(
                    controller: nameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Channel Name',
                      hintText: 'e.g. BYD Jakarta - Main',
                      prefixIcon: Icon(Icons.label_rounded, size: 20),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: phoneCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Phone Number',
                      hintText: '+6281234567890',
                      prefixIcon: Icon(Icons.phone_rounded, size: 20),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: phoneIdCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Phone Number ID',
                      hintText: 'From Meta Business Manager',
                      prefixIcon: Icon(Icons.fingerprint_rounded, size: 20),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: businessIdCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Business Account ID (optional)',
                      hintText: 'Meta WABA ID',
                      prefixIcon: Icon(Icons.business_rounded, size: 20),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: tokenCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'Access Token',
                      hintText: 'Permanent or System User Token',
                      prefixIcon: Icon(Icons.key_rounded, size: 20),
                    ),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String?>(
                    value: selectedDeptId,
                    decoration: const InputDecoration(
                      labelText: 'Department (optional)',
                      prefixIcon: Icon(Icons.account_tree_rounded, size: 20),
                    ),
                    items: [
                      const DropdownMenuItem<String?>(
                          value: null, child: Text('No department')),
                      ..._departments.map((d) => DropdownMenuItem<String?>(
                          value: d.id, child: Text(d.name))),
                    ],
                    onChanged: isSaving
                        ? null
                        : (v) => setDialogState(() => selectedDeptId = v),
                  ),
                  const SizedBox(height: 28),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                          onPressed: isSaving ? null : () => Navigator.pop(ctx),
                          child: const Text('Cancel')),
                      const SizedBox(width: 12),
                      ElevatedButton(
                        onPressed: isSaving
                            ? null
                            : () async {
                                if (nameCtrl.text.trim().isEmpty ||
                                    phoneCtrl.text.trim().isEmpty ||
                                    phoneIdCtrl.text.trim().isEmpty ||
                                    tokenCtrl.text.trim().isEmpty) {
                                  _showError(
                                      'Name, phone, phone number ID, and access token are required.');
                                  return;
                                }
                                setDialogState(() => isSaving = true);
                                try {
                                  final dio = di.sl<DioClient>().dio;
                                  final body = {
                                    'name': nameCtrl.text.trim(),
                                    'phoneNumber': phoneCtrl.text.trim(),
                                    'phoneNumberId': phoneIdCtrl.text.trim(),
                                    'accessToken': tokenCtrl.text.trim(),
                                    if (businessIdCtrl.text.trim().isNotEmpty)
                                      'businessAccountId':
                                          businessIdCtrl.text.trim(),
                                    if (selectedDeptId != null)
                                      'departmentId': selectedDeptId,
                                  };
                                  if (isEditing) {
                                    await dio.patch(
                                        ApiConstants.channel(channel['id']),
                                        data: {
                                          'name': nameCtrl.text.trim(),
                                          if (tokenCtrl.text.trim().isNotEmpty)
                                            'accessToken':
                                                tokenCtrl.text.trim(),
                                          if (selectedDeptId != null)
                                            'departmentId': selectedDeptId,
                                        });
                                    _showSuccess('Channel updated.');
                                  } else {
                                    await dio.post(ApiConstants.channels,
                                        data: body);
                                    _showSuccess(
                                        'Channel connected! Use "Test" to verify.');
                                  }
                                  if (ctx.mounted) Navigator.pop(ctx);
                                  await _loadChannels();
                                } catch (error) {
                                  setDialogState(() => isSaving = false);
                                  _showError(_formatError(error));
                                }
                              },
                        style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF25D366)),
                        child: isSaving
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Colors.white))
                            : Text(
                                isEditing ? 'Save Changes' : 'Connect Channel',
                                style: const TextStyle(color: Colors.white)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _refreshTeamData() async {
    await _loadTeamMembers(page: _teamPage);
    await _loadSupervisorCandidates();
    await _loadRecentAuditLogs();
  }

  Future<void> _showDepartmentDialog({
    SettingsDepartmentModel? department,
  }) async {
    final isEditing = department != null;
    final theme = Theme.of(context);
    final nameController = TextEditingController(text: department?.name ?? '');
    final descriptionController = TextEditingController(
      text: department?.description ?? '',
    );
    var isSaving = false;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            return Dialog(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
              child: Container(
                width: 460,
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isEditing ? 'Edit Department' : 'Add Department',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 24),
                    TextField(
                      controller: nameController,
                      decoration: const InputDecoration(
                        labelText: 'Department Name',
                        hintText: 'e.g. BYD Arista Jakarta Barat',
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: descriptionController,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Description',
                        hintText: 'Optional context for this department',
                      ),
                    ),
                    const SizedBox(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: isSaving
                              ? null
                              : () => Navigator.pop(dialogContext),
                          child: const Text('Cancel'),
                        ),
                        const SizedBox(width: 12),
                        ElevatedButton(
                          onPressed: isSaving
                              ? null
                              : () async {
                                  if (nameController.text.trim().isEmpty) {
                                    _showError('Department name is required.');
                                    return;
                                  }

                                  setDialogState(() => isSaving = true);

                                  try {
                                    if (isEditing) {
                                      await _settingsRemoteDataSource
                                          .updateDepartment(
                                        id: department.id,
                                        name: nameController.text.trim(),
                                        description: descriptionController.text
                                                .trim()
                                                .isEmpty
                                            ? null
                                            : descriptionController.text.trim(),
                                      );
                                      _showSuccess(
                                        'Department updated successfully.',
                                      );
                                    } else {
                                      await _settingsRemoteDataSource
                                          .createDepartment(
                                        name: nameController.text.trim(),
                                        description: descriptionController.text
                                                .trim()
                                                .isEmpty
                                            ? null
                                            : descriptionController.text.trim(),
                                      );
                                      _showSuccess(
                                        'Department created successfully.',
                                      );
                                    }

                                    if (dialogContext.mounted) {
                                      Navigator.pop(dialogContext);
                                    }
                                    await _loadDepartments();
                                    await _loadRecentAuditLogs();
                                  } catch (error) {
                                    setDialogState(() => isSaving = false);
                                    _showError(_formatError(error));
                                  }
                                },
                          child: isSaving
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : Text(
                                  isEditing
                                      ? 'Save Changes'
                                      : 'Create Department',
                                ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _showAccountDialog({
    SettingsTeamMemberModel? member,
  }) async {
    final isEditing = member != null;
    final theme = Theme.of(context);
    final roleOptions = _availableRolesForCurrentUser();

    if (roleOptions.isEmpty && !isEditing) {
      _showError('Your role cannot create new accounts.');
      return;
    }

    final nameController = TextEditingController(text: member?.fullName ?? '');
    final emailController = TextEditingController(text: member?.email ?? '');
    final chatLimitController = TextEditingController(
      text: (member?.maxConcurrentChats ?? 10).toString(),
    );
    var selectedRole = member?.role ?? roleOptions.last;
    String? selectedDepartmentId = member?.department?.id;
    String? selectedSupervisorId = member?.supervisor?.id;
    var isSaving = false;
    var roundRobin = member?.availableForRoundRobin ?? true;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            final showSupervisor = selectedRole == 'agent';
            final eligibleSupervisors = _supervisorCandidates
                .where((candidate) => candidate.id != member?.id)
                .toList();

            return Dialog(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
              child: Container(
                width: 520,
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isEditing ? 'Edit Account' : 'Create Account',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      isEditing
                          ? 'Update role, routing, and workload settings.'
                          : 'A temporary password will be emailed to the new team member.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withOpacity(0.5),
                      ),
                    ),
                    const SizedBox(height: 24),
                    TextField(
                      controller: nameController,
                      decoration: const InputDecoration(
                        labelText: 'Full Name',
                        prefixIcon:
                            Icon(Icons.person_outline_rounded, size: 20),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: emailController,
                      enabled: !isEditing,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: 'Email Address',
                        prefixIcon: Icon(Icons.email_outlined, size: 20),
                      ),
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      value: selectedRole,
                      decoration: const InputDecoration(
                        labelText: 'Role',
                        prefixIcon: Icon(Icons.badge_outlined, size: 20),
                      ),
                      items: roleOptions
                          .map(
                            (role) => DropdownMenuItem(
                              value: role,
                              child: Text(_roleLabel(role)),
                            ),
                          )
                          .toList(),
                      onChanged: isSaving
                          ? null
                          : (value) {
                              if (value == null) return;
                              setDialogState(() {
                                selectedRole = value;
                                if (selectedRole != 'agent') {
                                  selectedSupervisorId = null;
                                }
                              });
                            },
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String?>(
                      value: selectedDepartmentId,
                      decoration: const InputDecoration(
                        labelText: 'Department',
                        prefixIcon: Icon(Icons.account_tree_rounded, size: 20),
                      ),
                      items: [
                        const DropdownMenuItem<String?>(
                          value: null,
                          child: Text('No department'),
                        ),
                        ..._departments.map(
                          (department) => DropdownMenuItem<String?>(
                            value: department.id,
                            child: Text(department.name),
                          ),
                        ),
                      ],
                      onChanged: isSaving
                          ? null
                          : (value) => setDialogState(
                              () => selectedDepartmentId = value),
                    ),
                    if (showSupervisor) ...[
                      const SizedBox(height: 16),
                      DropdownButtonFormField<String?>(
                        value: selectedSupervisorId,
                        decoration: const InputDecoration(
                          labelText: 'Supervisor',
                          prefixIcon:
                              Icon(Icons.support_agent_rounded, size: 20),
                        ),
                        items: [
                          const DropdownMenuItem<String?>(
                            value: null,
                            child: Text('No supervisor'),
                          ),
                          ...eligibleSupervisors.map(
                            (candidate) => DropdownMenuItem<String?>(
                              value: candidate.id,
                              child: Text(candidate.fullName),
                            ),
                          ),
                        ],
                        onChanged: isSaving
                            ? null
                            : (value) => setDialogState(
                                  () => selectedSupervisorId = value,
                                ),
                      ),
                    ],
                    if (isEditing) ...[
                      const SizedBox(height: 16),
                      TextField(
                        controller: chatLimitController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Max Concurrent Chats',
                          prefixIcon: Icon(Icons.forum_rounded, size: 20),
                        ),
                      ),
                      const SizedBox(height: 16),
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
                        onChanged: isSaving
                            ? null
                            : (v) => setDialogState(() => roundRobin = v),
                      ),
                    ],
                    const SizedBox(height: 28),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: isSaving
                              ? null
                              : () => Navigator.pop(dialogContext),
                          child: const Text('Cancel'),
                        ),
                        const SizedBox(width: 12),
                        ElevatedButton(
                          onPressed: isSaving
                              ? null
                              : () async {
                                  if (nameController.text.trim().isEmpty ||
                                      emailController.text.trim().isEmpty) {
                                    _showError(
                                      'Name and email are required fields.',
                                    );
                                    return;
                                  }

                                  setDialogState(() => isSaving = true);

                                  try {
                                    if (isEditing) {
                                      await _settingsRemoteDataSource
                                          .updateUser(
                                        id: member.id,
                                        fullName: nameController.text.trim(),
                                        role: selectedRole,
                                        departmentId: selectedDepartmentId,
                                        supervisorId: showSupervisor
                                            ? selectedSupervisorId
                                            : null,
                                        maxConcurrentChats: int.tryParse(
                                              chatLimitController.text.trim(),
                                            ) ??
                                            member.maxConcurrentChats,
                                        availableForRoundRobin: roundRobin,
                                      );
                                      _showSuccess(
                                        'Account updated successfully.',
                                      );
                                    } else {
                                      final message =
                                          await _settingsRemoteDataSource
                                              .createAccount(
                                        email: emailController.text.trim(),
                                        fullName: nameController.text.trim(),
                                        role: selectedRole,
                                        departmentId: selectedDepartmentId,
                                        supervisorId: showSupervisor
                                            ? selectedSupervisorId
                                            : null,
                                      );
                                      _showSuccess(message);
                                    }

                                    if (dialogContext.mounted) {
                                      Navigator.pop(dialogContext);
                                    }
                                    await _refreshTeamData();
                                  } catch (error) {
                                    setDialogState(() => isSaving = false);
                                    _showError(_formatError(error));
                                  }
                                },
                          child: isSaving
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : Text(
                                  isEditing ? 'Save Changes' : 'Create Account',
                                ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _confirmStatusChange(SettingsTeamMemberModel member) async {
    final isReactivating = member.status == 'inactive';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(
            isReactivating ? 'Reactivate account?' : 'Deactivate account?',
          ),
          content: Text(
            isReactivating
                ? 'This will restore ${member.fullName} to active status.'
                : '${member.fullName} will lose access until the account is reactivated.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: Text(isReactivating ? 'Reactivate' : 'Deactivate'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    try {
      final message = isReactivating
          ? await _settingsRemoteDataSource.reactivateUser(member.id)
          : await _settingsRemoteDataSource.deactivateUser(member.id);
      _showSuccess(message);
      await _refreshTeamData();
    } catch (error) {
      _showError(_formatError(error));
    }
  }

  Future<void> _changePassword() async {
    final currentPassword = _currentPasswordController.text.trim();
    final newPassword = _newPasswordController.text.trim();
    final confirmPassword = _confirmPasswordController.text.trim();

    if (currentPassword.isEmpty ||
        newPassword.isEmpty ||
        confirmPassword.isEmpty) {
      _showError('Please fill in all password fields.');
      return;
    }

    if (newPassword != confirmPassword) {
      _showError('New password and confirmation do not match.');
      return;
    }

    final passwordPolicy = RegExp(r'^(?=.*[A-Z])(?=.*\d).{8,}$');
    if (!passwordPolicy.hasMatch(newPassword)) {
      _showError(
        'Password must be at least 8 characters with 1 uppercase letter and 1 number.',
      );
      return;
    }

    setState(() => _isChangingPassword = true);

    try {
      final message = await _settingsRemoteDataSource.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );

      if (!mounted) return;

      _currentPasswordController.clear();
      _newPasswordController.clear();
      _confirmPasswordController.clear();
      _showSuccess(message);
      await _loadRecentAuditLogs();
    } catch (error) {
      _showError(_formatError(error));
    } finally {
      if (mounted) {
        setState(() => _isChangingPassword = false);
      }
    }
  }

  List<String> _availableRolesForCurrentUser() {
    const orderedRoles = ['admin', 'manager', 'supervisor', 'agent'];
    final currentLevel = _roleLevel(_currentUserRole);

    return orderedRoles
        .where((role) => _roleLevel(role) < currentLevel)
        .toList();
  }

  bool _canManageMember(SettingsTeamMemberModel member) {
    return _canManageAccounts &&
        member.id != _currentUserId &&
        _roleLevel(_currentUserRole) > _roleLevel(member.role);
  }

  int _roleLevel(String role) {
    switch (role) {
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

  String _roleLabel(String role) {
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

  String _statusLabel(String status) {
    switch (status) {
      case 'active':
        return 'Active';
      case 'inactive':
        return 'Inactive';
      case 'invited':
        return 'Invited';
      default:
        return status;
    }
  }

  Color _roleColor(BuildContext context, String role) {
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
        return Theme.of(context).colorScheme.primary;
    }
  }

  Color _statusColor(BuildContext context, String status) {
    switch (status) {
      case 'active':
        return const Color(0xFF25D366);
      case 'invited':
        return const Color(0xFFFDCB6E);
      case 'inactive':
      default:
        return Theme.of(context).colorScheme.onSurface.withOpacity(0.55);
    }
  }

  String _formatDateShort(DateTime? value) {
    if (value == null) {
      return 'Unavailable';
    }
    return _dateFormat.format(value.toLocal());
  }

  String _formatError(Object error) {
    return error.toString().replaceFirst('Exception: ', '');
  }

  String _buildAuditHeadline(AuditLogModel log) {
    final actor =
        log.userName?.trim().isNotEmpty == true ? log.userName! : 'System';
    return '$actor • ${_prettifyAuditAction(log.action)}';
  }

  String _buildAuditDetail(AuditLogModel log) {
    if (log.metadata['email'] != null) {
      return 'Email: ${log.metadata['email']}';
    }
    if (log.metadata['name'] != null) {
      return 'Department: ${log.metadata['name']}';
    }
    if (log.metadata['fullName'] != null) {
      return 'Name: ${log.metadata['fullName']}';
    }
    if (log.metadata['role'] != null) {
      return 'Role: ${log.metadata['role']}';
    }
    if (log.targetType?.isNotEmpty == true) {
      return 'Target: ${log.targetType}';
    }
    return 'No additional metadata recorded.';
  }

  String _prettifyAuditAction(String action) {
    return action
        .replaceAll('.', ' ')
        .replaceAll('_', ' ')
        .split(' ')
        .where((part) => part.isNotEmpty)
        .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
        .join(' ');
  }

  void _showSuccess(String message) {
    if (!mounted) return;
    AppSnackbar.success(context, message);
  }

  void _showError(String message) {
    if (!mounted) return;
    AppSnackbar.error(context, message);
  }
}

class _SettingsSection {
  final String label;
  final IconData icon;

  const _SettingsSection(this.label, this.icon);
}
