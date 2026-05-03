// ============================================================
// Settings Page — Organization & App Configuration
// ============================================================
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  int _selectedSection = 0;

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
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isWide = MediaQuery.of(context).size.width >= 900;

    return Scaffold(
      body: isWide
          ? Row(
              children: [
                // Section List
                SizedBox(
                  width: 260,
                  child: _buildSectionList(context),
                ),
                VerticalDivider(width: 1, color: theme.dividerColor),
                // Content
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
          const SizedBox(height: 16),
          ..._sections.asMap().entries.map((entry) {
            final index = entry.key;
            final section = entry.value;
            final isSelected = _selectedSection == index;

            return ListTile(
              leading: Icon(
                section.icon,
                color: isSelected ? theme.colorScheme.primary : theme.colorScheme.onSurface.withOpacity(0.5),
                size: 22,
              ),
              title: Text(
                section.label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                  color: isSelected ? theme.colorScheme.primary : theme.colorScheme.onSurface.withOpacity(0.8),
                ),
              ),
              selected: isSelected,
              selectedTileColor: theme.colorScheme.primary.withOpacity(0.08),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 2),
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

          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _sections.asMap().entries.map((entry) {
                final isSelected = _selectedSection == entry.key;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(entry.value.label, style: TextStyle(
                      fontSize: 12,
                      color: isSelected ? Colors.white : theme.colorScheme.onSurface.withOpacity(0.7),
                    )),
                    avatar: Icon(entry.value.icon, size: 16, color: isSelected ? Colors.white : theme.colorScheme.onSurface.withOpacity(0.5)),
                    selected: isSelected,
                    selectedColor: theme.colorScheme.primary,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => _selectedSection = entry.key),
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
      case 0: return _buildProfileSection(context);
      case 1: return _buildOrgSection(context);
      case 2: return _buildDepartmentsSection(context);
      case 3: return _buildWhatsAppSection(context);
      case 4: return _buildTeamSection(context);
      case 5: return _buildNotificationsSection(context);
      case 6: return _buildSecuritySection(context);
      default: return const SizedBox.shrink();
    }
  }

  Widget _buildProfileSection(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Profile', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text('Manage your personal information', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.5))),
          const SizedBox(height: 28),
          // Avatar
          Center(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 48,
                  backgroundColor: theme.colorScheme.primary.withOpacity(0.2),
                  child: Icon(Icons.person_rounded, size: 48, color: theme.colorScheme.primary),
                ),
                const SizedBox(height: 12),
                TextButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.camera_alt_rounded, size: 16),
                  label: const Text('Change Avatar'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _buildSettingsCard(context, [
            _buildTextField('Full Name', 'Admin'),
            _buildTextField('Email', 'admin@simpulx.com', enabled: false),
            _buildTextField('Phone', '+62...'),
          ]),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerRight,
            child: ElevatedButton(onPressed: () {}, child: const Text('Save Changes')),
          ),
        ],
      ),
    );
  }

  Widget _buildOrgSection(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Organization', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text('Manage your organization settings', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.5))),
          const SizedBox(height: 28),
          _buildSettingsCard(context, [
            _buildTextField('Organization Name', 'My Organization'),
            _buildTextField('Website', 'https://'),
            _buildTextField('Industry', ''),
          ]),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerRight,
            child: ElevatedButton(onPressed: () {}, child: const Text('Save Changes')),
          ),
        ],
      ),
    );
  }

  Widget _buildDepartmentsSection(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Departments', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text('Organize your team by departments', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.5))),
              ]),
              ElevatedButton.icon(
                onPressed: () => _showAddDepartmentDialog(context),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Add Department'),
              ),
            ],
          ),
          const SizedBox(height: 28),
          // Empty state
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(40),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: theme.dividerColor),
            ),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFDAA5B).withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.account_tree_rounded, size: 36, color: Color(0xFFFDAA5B)),
                ),
                const SizedBox(height: 16),
                Text('No departments yet', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Text(
                  'Create departments to organize your agents\nby location, brand, or function.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withOpacity(0.4), height: 1.5),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showAddDepartmentDialog(BuildContext context) {
    final theme = Theme.of(context);
    showDialog(
      context: context,
      builder: (context) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: Container(
          width: 440,
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Add Department', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 24),
              const TextField(decoration: InputDecoration(labelText: 'Department Name', hintText: 'e.g. BYD Arista Jakarta Barat')),
              const SizedBox(height: 16),
              const TextField(decoration: InputDecoration(labelText: 'Description (optional)'), maxLines: 2),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                  const SizedBox(width: 12),
                  ElevatedButton(onPressed: () => Navigator.pop(context), child: const Text('Create')),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildWhatsAppSection(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('WhatsApp Integration', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text('Configure your WhatsApp Business API', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.5))),
          const SizedBox(height: 28),

          // Connection Status
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [
                const Color(0xFF25D366).withOpacity(0.1),
                const Color(0xFF25D366).withOpacity(0.05),
              ]),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF25D366).withOpacity(0.2)),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF25D366).withOpacity(0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.chat_rounded, color: Color(0xFF25D366), size: 24),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('WhatsApp Cloud API', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Container(width: 8, height: 8, decoration: const BoxDecoration(color: Color(0xFF636E72), shape: BoxShape.circle)),
                          const SizedBox(width: 6),
                          Text('Not configured', style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withOpacity(0.5))),
                        ],
                      ),
                    ],
                  ),
                ),
                ElevatedButton(
                  onPressed: () {},
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF25D366)),
                  child: const Text('Connect'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _buildSettingsCard(context, [
            _buildTextField('Phone Number ID', ''),
            _buildTextField('Access Token', '', obscure: true),
            _buildTextField('Webhook Verify Token', ''),
          ]),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withOpacity(0.05),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline_rounded, color: theme.colorScheme.primary, size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Webhook URL: https://app.simpulx.com/api/v1/webhook/whatsapp',
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.primary),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.copy_rounded, size: 18),
                  onPressed: () {},
                  tooltip: 'Copy URL',
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerRight,
            child: ElevatedButton(onPressed: () {}, child: const Text('Save Configuration')),
          ),
        ],
      ),
    );
  }

  Widget _buildTeamSection(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Team', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text('Manage agents and permissions', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.5))),
              ]),
              ElevatedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.person_add_rounded, size: 18),
                label: const Text('Invite Agent'),
              ),
            ],
          ),
          const SizedBox(height: 28),
          // Team members
          Container(
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: theme.dividerColor),
            ),
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              leading: CircleAvatar(
                backgroundColor: theme.colorScheme.primary.withOpacity(0.2),
                child: Icon(Icons.person_rounded, color: theme.colorScheme.primary),
              ),
              title: const Text('Admin', style: TextStyle(fontWeight: FontWeight.w600)),
              subtitle: const Text('admin@simpulx.com', style: TextStyle(fontSize: 12)),
              trailing: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text('Admin', style: TextStyle(fontSize: 11, color: theme.colorScheme.primary, fontWeight: FontWeight.w600)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationsSection(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Notifications', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text('Configure how you receive notifications', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.5))),
          const SizedBox(height: 28),
          _buildSettingsCard(context, [
            _buildSwitchTile('New message notifications', true),
            _buildSwitchTile('New conversation alerts', true),
            _buildSwitchTile('Ticket assignment notifications', true),
            _buildSwitchTile('Email digest (daily)', false),
            _buildSwitchTile('Sound notifications', true),
          ]),
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
          Text('Security', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text('Manage your account security', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.5))),
          const SizedBox(height: 28),
          _buildSettingsCard(context, [
            _buildTextField('Current Password', '', obscure: true),
            _buildTextField('New Password', '', obscure: true),
            _buildTextField('Confirm New Password', '', obscure: true),
          ]),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerRight,
            child: ElevatedButton(onPressed: () {}, child: const Text('Update Password')),
          ),
          const SizedBox(height: 32),
          // Danger zone
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.redAccent.withOpacity(0.3)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Danger Zone', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      Text('Permanently delete your account and all data.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.5))),
                    ],
                  ),
                ),
                OutlinedButton(
                  onPressed: () {},
                  style: OutlinedButton.styleFrom(foregroundColor: Colors.redAccent, side: const BorderSide(color: Colors.redAccent)),
                  child: const Text('Delete Account'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Helpers ──────────────────────────────────────────
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
        children: children.expand((w) => [w, const SizedBox(height: 16)]).toList()..removeLast(),
      ),
    );
  }

  Widget _buildTextField(String label, String initial, {bool enabled = true, bool obscure = false}) {
    return TextField(
      controller: TextEditingController(text: initial),
      enabled: enabled,
      obscureText: obscure,
      decoration: InputDecoration(labelText: label),
    );
  }

  Widget _buildSwitchTile(String label, bool initial) {
    return StatefulBuilder(
      builder: (context, setInner) {
        bool val = initial;
        return SwitchListTile(
          title: Text(label, style: const TextStyle(fontSize: 14)),
          value: val,
          onChanged: (v) => setInner(() => val = v),
          contentPadding: EdgeInsets.zero,
        );
      },
    );
  }
}

class _SettingsSection {
  final String label;
  final IconData icon;
  const _SettingsSection(this.label, this.icon);
}
