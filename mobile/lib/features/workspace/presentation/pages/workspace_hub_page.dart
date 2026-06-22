import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';

/// Role-gated back-office hub (reached from Settings). High-value manager tools
/// are native; deeper configuration stays on the web dashboard.
class WorkspaceHubPage extends StatelessWidget {
  const WorkspaceHubPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Workspace')),
      body: ListView(
        children: [
          const _SectionLabel('Manage here'),
          _Tile(
            icon: Icons.campaign_outlined,
            title: 'Broadcasts',
            subtitle: 'Monitor delivery and send',
            onTap: () => context.push('/workspace/broadcasts'),
          ),
          _Tile(
            icon: Icons.groups_outlined,
            title: 'Team',
            subtitle: 'Who is online and their load',
            onTap: () => context.push('/workspace/team'),
          ),
          const Divider(height: 1),
          const _SectionLabel('On the web dashboard'),
          const _InfoTile(text: 'Templates, channels, campaigns, ad accounts, '
              'roles, and audit logs are managed on the web dashboard.'),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: AppColors.primary),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline_rounded,
              size: 18, color: AppColors.textMuted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: const TextStyle(
                    color: AppColors.textSecondary, fontSize: 13, height: 1.4)),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Text(text.toUpperCase(),
          style: const TextStyle(
              color: AppColors.textMuted,
              letterSpacing: 0.6,
              fontWeight: FontWeight.w700,
              fontSize: 11)),
    );
  }
}
