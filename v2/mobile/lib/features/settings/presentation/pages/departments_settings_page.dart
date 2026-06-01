// ============================================================
// Departments Settings Page - Table view with delete
// ============================================================
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:simpulx/features/settings/data/datasources/settings_remote_datasource.dart';
import 'package:simpulx/features/settings/data/models/settings_models.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';

class DepartmentsSettingsPage extends StatefulWidget {
  const DepartmentsSettingsPage({super.key});

  @override
  State<DepartmentsSettingsPage> createState() =>
      _DepartmentsSettingsPageState();
}

class _DepartmentsSettingsPageState extends State<DepartmentsSettingsPage> {
  late final SettingsRemoteDataSource _ds;

  bool _loading = false;
  String? _error;
  List<SettingsDepartmentModel> _departments = const [];
  List<SettingsTeamMemberModel> _allUsers = const [];
  List<Map<String, dynamic>> _allChannels = const [];

  bool get _canManage {
    final state = context.read<AuthBloc>().state;
    if (state is! AuthAuthenticated) return false;
    final role = state.session.user.role;
    return role == 'owner' || role == 'admin' || role == 'manager';
  }

  @override
  void initState() {
    super.initState();
    _ds = di.sl<SettingsRemoteDataSource>();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = di.sl<DioClient>().dio;
      final deptsFuture = _ds.getDepartments();
      final usersFuture = _ds.getUsers(page: 1, limit: 500, status: 'active');
      final chFuture = dio.get(ApiConstants.channels);
      final deptsResult = await deptsFuture;
      final usersResult = await usersFuture;
      final chResponse = await chFuture;
      if (!mounted) return;
      final departments = deptsResult;
      final usersPage = usersResult;
      final chData = chResponse.data;
      final channels = chData is List
          ? List<Map<String, dynamic>>.from(chData)
          : List<Map<String, dynamic>>.from(
              (chData is Map ? chData['data'] : null) ?? []);
      setState(() {
        _departments = departments;
        _allUsers = usersPage.users;
        _allChannels = channels;
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        _buildHeader(theme),
        Expanded(child: _buildBody(theme)),
      ],
    );
  }

  Widget _buildHeader(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          IconButton(
            onPressed: _load,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh_rounded, size: 20),
          ),
          if (_canManage) ...[
            const SizedBox(width: 8),
            FilledButton.icon(
              onPressed: () => _showDepartmentDialog(),
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Add Department'),
              style: FilledButton.styleFrom(
                backgroundColor: theme.colorScheme.primary,
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildBody(ThemeData theme) {
    if (_loading && _departments.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _departments.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.wifi_off_rounded,
                size: 48,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.2)),
            const SizedBox(height: 12),
            Text('Could not load departments',
                style: theme.textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(_error!, style: theme.textTheme.bodySmall),
            const SizedBox(height: 14),
            FilledButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }
    if (_departments.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.account_tree_rounded,
                size: 48,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.2)),
            const SizedBox(height: 12),
            Text('No departments yet',
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text('Create departments to organize teams.',
                style: theme.textTheme.bodySmall),
            if (_canManage) ...[
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: () => _showDepartmentDialog(),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Create Department'),
              ),
            ],
          ],
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(28, 20, 28, 24),
      child: SizedBox(
        width: double.infinity,
        child: DataTable(
          dataRowMinHeight: 52,
          dataRowMaxHeight: 60,
          columns: [
            const DataColumn(label: Text('Name')),
            const DataColumn(label: Text('Agents')),
            const DataColumn(label: Text('Channel')),
            if (_canManage) const DataColumn(label: Text('Actions')),
          ],
          rows: _departments.map((dept) {
            final agents =
                _allUsers.where((u) => u.department?.id == dept.id).toList();
            final channels = _allChannels
                .where((ch) => ch['departmentId'] == dept.id)
                .toList();
            return DataRow(
              cells: [
                DataCell(Text(dept.name,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 13))),
                DataCell(agents.isEmpty
                    ? Text('-',
                        style: TextStyle(
                            fontSize: 13,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.4)))
                    : Wrap(
                        spacing: 4,
                        runSpacing: 4,
                        children: agents
                            .map((a) => Chip(
                                  label: Text(a.fullName,
                                      style: const TextStyle(fontSize: 12)),
                                  visualDensity: VisualDensity.compact,
                                  padding: EdgeInsets.zero,
                                  materialTapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                ))
                            .toList(),
                      )),
                DataCell(channels.isEmpty
                    ? Text('-',
                        style: TextStyle(
                            fontSize: 13,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.4)))
                    : Wrap(
                        spacing: 4,
                        runSpacing: 4,
                        children: channels
                            .map((ch) => Chip(
                                  avatar:
                                      const Icon(Icons.phone_android, size: 14),
                                  label: Text(
                                      ch['name']?.toString() ??
                                          ch['phoneNumber']?.toString() ??
                                          '?',
                                      style: const TextStyle(fontSize: 12)),
                                  visualDensity: VisualDensity.compact,
                                  padding: EdgeInsets.zero,
                                  materialTapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                ))
                            .toList(),
                      )),
                if (_canManage)
                  DataCell(Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        onPressed: () =>
                            _showDepartmentDialog(department: dept),
                        tooltip: 'Edit',
                        icon: Icon(Icons.edit_outlined,
                            size: 18,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.45)),
                      ),
                      IconButton(
                        onPressed: () => _confirmDelete(dept),
                        tooltip: 'Delete',
                        icon: Icon(Icons.delete_outline_rounded,
                            size: 18,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.45)),
                      ),
                    ],
                  )),
              ],
            );
          }).toList(),
        ),
      ),
    );
  }



  Future<void> _confirmDelete(SettingsDepartmentModel dept) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Department?'),
        content: Text(
            'This will deactivate "${dept.name}". Agents in this department will be unassigned.'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFEF4444)),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final msg = await _ds.deleteDepartment(dept.id);
      if (!mounted) return;
      AppSnackbar.success(context, msg);
      _load();
    } catch (e) {
      if (!mounted) return;
      AppSnackbar.error(context, '$e');
    }
  }

  Future<void> _showDepartmentDialog(
      {SettingsDepartmentModel? department}) async {
    final isEdit = department != null;
    final nameCtrl = TextEditingController(text: department?.name ?? '');
    final descCtrl = TextEditingController(text: department?.description ?? '');
    var saving = false;

    // Pre-select agents already in this department
    final selectedAgentIds = <String>{};
    final selectedChannelIds = <String>{};
    if (isEdit) {
      for (final u in _allUsers) {
        if (u.department?.id == department.id) {
          selectedAgentIds.add(u.id);
        }
      }
      // Channels assigned to this department (if channelDepartmentId matches)
      for (final ch in _allChannels) {
        if (ch['departmentId'] == department.id) {
          selectedChannelIds.add(ch['id'].toString());
        }
      }
    }

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          final theme = Theme.of(ctx);
          return Dialog(
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            child: Container(
              width: 560,
              padding: const EdgeInsets.all(28),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(isEdit ? 'Edit Department' : 'Add Department',
                        style: theme.textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    Text(
                      isEdit
                          ? 'Update department info, agents, and channels.'
                          : 'Create a department and assign agents & channels.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color:
                            theme.colorScheme.onSurface.withValues(alpha: 0.5),
                      ),
                    ),
                    const SizedBox(height: 22),
                    TextField(
                      controller: nameCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Department Name',
                        hintText: 'e.g. BYD Arista Jakarta Barat',
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: descCtrl,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Description',
                        hintText: 'Optional context for this department',
                      ),
                    ),
                    const SizedBox(height: 20),
                    // Agents tag field
                    Text('Agents',
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    _TagSelector<SettingsTeamMemberModel>(
                      items: _allUsers,
                      selectedIds: selectedAgentIds,
                      labelFn: (u) => u.fullName,
                      idFn: (u) => u.id,
                      hintText: 'Search and add agents...',
                      onChanged: (ids) => setDialogState(() => selectedAgentIds
                        ..clear()
                        ..addAll(ids)),
                    ),
                    const SizedBox(height: 20),
                    // Channels tag field
                    Text('Channels',
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    _TagSelector<Map<String, dynamic>>(
                      items: _allChannels,
                      selectedIds: selectedChannelIds,
                      labelFn: (ch) {
                        final name = ch['name'] ?? '';
                        final phone = ch['phoneNumber'] ?? '';
                        return phone.toString().isNotEmpty
                            ? '$name ($phone)'
                            : name.toString();
                      },
                      idFn: (ch) => ch['id'].toString(),
                      hintText: 'Search and add channels...',
                      onChanged: (ids) =>
                          setDialogState(() => selectedChannelIds
                            ..clear()
                            ..addAll(ids)),
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
                                  if (nameCtrl.text.trim().isEmpty) {
                                    AppSnackbar.error(
                                        ctx, 'Department name is required.');
                                    return;
                                  }
                                  setDialogState(() => saving = true);
                                  try {
                                    String deptId;
                                    if (isEdit) {
                                      await _ds.updateDepartment(
                                        id: department.id,
                                        name: nameCtrl.text.trim(),
                                        description:
                                            descCtrl.text.trim().isEmpty
                                                ? null
                                                : descCtrl.text.trim(),
                                      );
                                      deptId = department.id;
                                    } else {
                                      final created =
                                          await _ds.createDepartment(
                                        name: nameCtrl.text.trim(),
                                        description:
                                            descCtrl.text.trim().isEmpty
                                                ? null
                                                : descCtrl.text.trim(),
                                      );
                                      deptId = created.id;
                                    }
                                    // Update agent assignments
                                    for (final u in _allUsers) {
                                      final wasInDept =
                                          u.department?.id == deptId;
                                      final nowInDept =
                                          selectedAgentIds.contains(u.id);
                                      if (nowInDept && !wasInDept) {
                                        await _ds.updateUser(
                                          id: u.id,
                                          fullName: u.fullName,
                                          role: u.role,
                                          departmentId: deptId,
                                        );
                                      } else if (!nowInDept && wasInDept) {
                                        await _ds.updateUser(
                                          id: u.id,
                                          fullName: u.fullName,
                                          role: u.role,
                                          departmentId: null,
                                        );
                                      }
                                    }
                                    // Update channel assignments
                                    final dio = di.sl<DioClient>().dio;
                                    for (final ch in _allChannels) {
                                      final chId = ch['id'].toString();
                                      final wasInDept =
                                          ch['departmentId'] == deptId;
                                      final nowInDept =
                                          selectedChannelIds.contains(chId);
                                      if (nowInDept && !wasInDept) {
                                        await dio.patch(
                                          ApiConstants.channel(chId),
                                          data: {'departmentId': deptId},
                                        );
                                      } else if (!nowInDept && wasInDept) {
                                        await dio.patch(
                                          ApiConstants.channel(chId),
                                          data: {'departmentId': null},
                                        );
                                      }
                                    }
                                    if (ctx.mounted) Navigator.pop(ctx);
                                    _load();
                                  } catch (e) {
                                    setDialogState(() => saving = false);
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
                              : Text(isEdit
                                  ? 'Save Changes'
                                  : 'Create Department'),
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
    descCtrl.dispose();
  }
}

// ── Reusable Tag Selector Widget ─────────────────────────
class _TagSelector<T> extends StatefulWidget {
  final List<T> items;
  final Set<String> selectedIds;
  final String Function(T) labelFn;
  final String Function(T) idFn;
  final String hintText;
  final ValueChanged<Set<String>> onChanged;

  const _TagSelector({
    required this.items,
    required this.selectedIds,
    required this.labelFn,
    required this.idFn,
    required this.hintText,
    required this.onChanged,
  });

  @override
  State<_TagSelector<T>> createState() => _TagSelectorState<T>();
}

class _TagSelectorState<T> extends State<_TagSelector<T>> {
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
        // Selected tags
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
        // Search input
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
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
        ),
        // Dropdown suggestions
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
