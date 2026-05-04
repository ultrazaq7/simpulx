// ============================================================
// Mobile Profile Page - Edit Profile, Change Password, Settings
// ============================================================
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/constants/api_constants.dart';
import 'package:simpulx/core/widgets/app_snackbar.dart';

class MobileProfilePage extends StatefulWidget {
  const MobileProfilePage({super.key});

  @override
  State<MobileProfilePage> createState() => _MobileProfilePageState();
}

class _MobileProfilePageState extends State<MobileProfilePage> {
  final _nameController = TextEditingController();
  final _currentPwController = TextEditingController();
  final _newPwController = TextEditingController();
  final _confirmPwController = TextEditingController();
  final _scrollController = ScrollController();
  bool _editingName = false;
  bool _savingName = false;
  bool _showChangePw = false;
  bool _savingPw = false;
  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureConfirm = true;
  String _timezone = 'Asia/Jakarta';
  bool _loadingTz = true;

  @override
  void initState() {
    super.initState();
    _loadTimezone();
  }

  Future<void> _loadTimezone() async {
    try {
      final dio = di.sl<DioClient>().dio;
      final res = await dio.get(ApiConstants.organization);
      final settings = (res.data['settings'] as Map<String, dynamic>?) ?? {};
      if (mounted) {
        setState(() {
          _timezone = (settings['timezone'] as String?) ?? 'Asia/Jakarta';
          _loadingTz = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingTz = false);
    }
  }

  Future<void> _saveTimezone(String tz) async {
    try {
      final dio = di.sl<DioClient>().dio;
      final res = await dio.get(ApiConstants.organization);
      final existingSettings =
          (res.data['settings'] as Map<String, dynamic>?) ?? {};
      await dio.patch(ApiConstants.organization, data: {
        'settings': {...existingSettings, 'timezone': tz},
      });
      if (mounted) {
        AppSnackbar.success(context, 'Timezone updated');
      }
    } catch (_) {
      if (mounted) {
        AppSnackbar.error(context, 'Failed to update timezone');
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _currentPwController.dispose();
    _newPwController.dispose();
    _confirmPwController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _saveName() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;
    setState(() => _savingName = true);
    try {
      final dio = di.sl<DioClient>().dio;
      await dio.patch('/auth/profile', data: {'fullName': name});
      if (mounted) {
        context.read<AuthBloc>().add(CheckAuthStatusEvent());
        setState(() {
          _editingName = false;
          _savingName = false;
        });
        AppSnackbar.success(context, 'Name updated');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _savingName = false);
        AppSnackbar.error(context, 'Failed to update name');
      }
    }
  }

  Future<void> _changePassword() async {
    final current = _currentPwController.text;
    final newPw = _newPwController.text;
    final confirm = _confirmPwController.text;

    if (current.isEmpty || newPw.isEmpty || confirm.isEmpty) {
      AppSnackbar.error(context, 'Please fill all fields');
      return;
    }
    if (newPw != confirm) {
      AppSnackbar.error(context, 'Passwords do not match');
      return;
    }
    if (!RegExp(r'^(?=.*[A-Z])(?=.*\d).{8,}$').hasMatch(newPw)) {
      AppSnackbar.error(
          context, 'Password must be 8+ chars with uppercase and number');
      return;
    }

    setState(() => _savingPw = true);
    try {
      final dio = di.sl<DioClient>().dio;
      await dio.patch(ApiConstants.changePassword, data: {
        'currentPassword': current,
        'newPassword': newPw,
      });
      if (mounted) {
        _currentPwController.clear();
        _newPwController.clear();
        _confirmPwController.clear();
        setState(() {
          _showChangePw = false;
          _savingPw = false;
        });
        AppSnackbar.success(context, 'Password changed successfully');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _savingPw = false);
        AppSnackbar.error(context, 'Current password is incorrect');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return BlocBuilder<AuthBloc, AuthState>(
      builder: (context, state) {
        if (state is! AuthAuthenticated) {
          return const SizedBox.shrink();
        }

        final user = state.session.user;
        final org = state.session.organization;
        final initials = user.fullName.isNotEmpty
            ? user.fullName
                .split(' ')
                .map((w) => w.isNotEmpty ? w[0] : '')
                .take(2)
                .join()
                .toUpperCase()
            : '?';

        if (!_editingName) {
          _nameController.text = user.fullName;
        }

        return Container(
          color: const Color(0xFFF8F9FC),
          child: ListView(
            controller: _scrollController,
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: EdgeInsets.fromLTRB(
              20,
              8,
              20,
              MediaQuery.of(context).padding.bottom + 32,
            ),
            children: [
              const SizedBox(height: 8),

              // ── Avatar + Name + Email + Role ──
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.04),
                      blurRadius: 10,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            theme.colorScheme.primary.withOpacity(0.8),
                            theme.colorScheme.primary,
                          ],
                        ),
                      ),
                      child: Center(
                        child: Text(
                          initials,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      user.fullName,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      user.email,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withOpacity(0.5),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 4),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        user.role.toUpperCase(),
                        style: TextStyle(
                          color: theme.colorScheme.primary,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      org.name,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withOpacity(0.4),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // ── Edit Profile Section ──
              _SectionCard(
                children: [
                  _SectionHeader(
                    icon: Icons.edit_rounded,
                    title: 'Edit Profile',
                    trailing: _editingName
                        ? null
                        : IconButton(
                            onPressed: () =>
                                setState(() => _editingName = true),
                            icon: Icon(Icons.edit_outlined,
                                size: 18, color: theme.colorScheme.primary),
                            style: IconButton.styleFrom(
                              minimumSize: const Size(32, 32),
                              padding: EdgeInsets.zero,
                            ),
                          ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _nameController,
                    enabled: _editingName,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                    decoration: InputDecoration(
                      labelText: 'Full Name',
                      labelStyle: TextStyle(
                        color: theme.colorScheme.onSurface.withOpacity(0.5),
                        fontSize: 13,
                      ),
                      prefixIcon: Icon(Icons.person_outline_rounded,
                          size: 20,
                          color: theme.colorScheme.onSurface.withOpacity(0.4)),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: theme.dividerColor),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: theme.dividerColor),
                      ),
                      disabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(
                            color: theme.dividerColor.withOpacity(0.3)),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      filled: !_editingName,
                      fillColor: theme.colorScheme.onSurface.withOpacity(0.03),
                    ),
                  ),
                  const SizedBox(height: 10),
                  // Email (read-only)
                  TextField(
                    controller: TextEditingController(text: user.email),
                    enabled: false,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w500,
                      color: theme.colorScheme.onSurface.withOpacity(0.5),
                    ),
                    decoration: InputDecoration(
                      labelText: 'Email',
                      labelStyle: TextStyle(
                        color: theme.colorScheme.onSurface.withOpacity(0.4),
                        fontSize: 13,
                      ),
                      prefixIcon: Icon(Icons.email_outlined,
                          size: 20,
                          color: theme.colorScheme.onSurface.withOpacity(0.3)),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      filled: true,
                      fillColor: theme.colorScheme.onSurface.withOpacity(0.03),
                    ),
                  ),
                  if (_editingName) ...[
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () =>
                                setState(() => _editingName = false),
                            style: OutlinedButton.styleFrom(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                            child: const Text('Cancel'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: FilledButton(
                            onPressed: _savingName ? null : _saveName,
                            style: FilledButton.styleFrom(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                            child: _savingName
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2, color: Colors.white))
                                : const Text('Save'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 12),

              // ── Change Password Section ──
              _SectionCard(
                children: [
                  InkWell(
                    onTap: () {
                      setState(() => _showChangePw = !_showChangePw);
                      if (_showChangePw) {
                        WidgetsBinding.instance.addPostFrameCallback((_) {
                          if (_scrollController.hasClients) {
                            _scrollController.animateTo(
                              _scrollController.position.maxScrollExtent,
                              duration: const Duration(milliseconds: 350),
                              curve: Curves.easeOut,
                            );
                          }
                        });
                      }
                    },
                    borderRadius: BorderRadius.circular(8),
                    child: Row(
                      children: [
                        Icon(Icons.lock_outline_rounded,
                            size: 20,
                            color:
                                theme.colorScheme.onSurface.withOpacity(0.6)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'Change Password',
                            style: theme.textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Icon(
                          _showChangePw
                              ? Icons.expand_less_rounded
                              : Icons.expand_more_rounded,
                          color: theme.colorScheme.onSurface.withOpacity(0.4),
                        ),
                      ],
                    ),
                  ),
                  if (_showChangePw) ...[
                    const SizedBox(height: 16),
                    _PasswordField(
                      controller: _currentPwController,
                      label: 'Current Password',
                      obscure: _obscureCurrent,
                      onToggle: () =>
                          setState(() => _obscureCurrent = !_obscureCurrent),
                    ),
                    const SizedBox(height: 10),
                    _PasswordField(
                      controller: _newPwController,
                      label: 'New Password',
                      obscure: _obscureNew,
                      onToggle: () =>
                          setState(() => _obscureNew = !_obscureNew),
                    ),
                    const SizedBox(height: 10),
                    _PasswordField(
                      controller: _confirmPwController,
                      label: 'Confirm New Password',
                      obscure: _obscureConfirm,
                      onToggle: () =>
                          setState(() => _obscureConfirm = !_obscureConfirm),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '8+ characters, 1 uppercase, 1 number',
                      style: TextStyle(
                        fontSize: 11,
                        color: theme.colorScheme.onSurface.withOpacity(0.4),
                      ),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _savingPw ? null : _changePassword,
                        style: FilledButton.styleFrom(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        child: _savingPw
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Colors.white))
                            : const Text('Update Password'),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 24),

              // ── Logout ──
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: () {
                    context.read<AuthBloc>().add(LogoutEvent());
                  },
                  icon: const Icon(Icons.logout_rounded, size: 20),
                  label: const Text(
                    'Logout',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFFCE4E4),
                    foregroundColor: const Color(0xFFD32F2F),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        );
      },
    );
  }
}

class _SectionCard extends StatelessWidget {
  final List<Widget> children;
  const _SectionCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String title;
  final Widget? trailing;
  const _SectionHeader(
      {required this.icon, required this.title, this.trailing});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(icon,
            size: 20, color: theme.colorScheme.onSurface.withOpacity(0.6)),
        const SizedBox(width: 12),
        Expanded(
          child: Text(title,
              style: theme.textTheme.bodyLarge?.copyWith(
                fontWeight: FontWeight.w600,
              )),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class _PasswordField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final bool obscure;
  final VoidCallback onToggle;
  const _PasswordField({
    required this.controller,
    required this.label,
    required this.obscure,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return TextField(
      controller: controller,
      obscureText: obscure,
      style: theme.textTheme.bodyMedium,
      decoration: InputDecoration(
        labelText: label,
        labelStyle: TextStyle(
            color: theme.colorScheme.onSurface.withOpacity(0.5), fontSize: 13),
        prefixIcon: Icon(Icons.lock_outline_rounded,
            size: 20, color: theme.colorScheme.onSurface.withOpacity(0.4)),
        suffixIcon: IconButton(
          onPressed: onToggle,
          icon: Icon(
            obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
            size: 20,
            color: theme.colorScheme.onSurface.withOpacity(0.4),
          ),
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: theme.dividerColor),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: theme.dividerColor),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      ),
    );
  }
}
