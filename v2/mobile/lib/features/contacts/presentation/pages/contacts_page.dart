// ============================================================
// Contacts Page - CRM Contact Management with Pagination + 360°
// ============================================================
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:simpulx/features/contacts/presentation/bloc/contacts_cubit.dart';
import 'package:simpulx/features/contacts/domain/entities/contact_entity.dart';
import 'package:simpulx/core/utils/avatar_colors.dart';
import 'package:simpulx/core/utils/source_channel.dart' as src;
import 'package:simpulx/core/theme/app_style.dart';

class ContactsPage extends StatefulWidget {
  const ContactsPage({super.key});

  @override
  State<ContactsPage> createState() => _ContactsPageState();
}

class _ContactsPageState extends State<ContactsPage> {
  final _searchController = TextEditingController();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _whatsappController = TextEditingController();

  @override
  void initState() {
    super.initState();
    context.read<ContactsCubit>().loadContacts();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _whatsappController.dispose();
    super.dispose();
  }


  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
              Container(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  border: Border(
                    bottom: BorderSide(
                      color: AppColors.border,
                    ),
                  ),
                ),
                child: Row(
                  children: [
                    // Search field
                    Expanded(
                      child: SizedBox(
                        height: 40,
                        child: TextField(
                          controller: _searchController,
                          onChanged: (q) => context.read<ContactsCubit>().search(q),
                          style: AppText.body,
                          decoration: InputDecoration(
                            hintText: 'Search contacts',
                            hintStyle: AppText.bodyMuted,
                            prefixIcon: const Icon(
                              Icons.search_rounded,
                              size: 20,
                              color: AppColors.textMuted,
                            ),
                            filled: true,
                            fillColor: AppColors.surfaceAlt,
                            isDense: true,
                            border: OutlineInputBorder(
                              borderRadius: AppRadius.rMd,
                              borderSide: BorderSide.none,
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 10,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Tooltip(
                      message: 'Add Contact',
                      child: InkWell(
                        onTap: () => _showAddContactDialog(context),
                        borderRadius: AppRadius.rMd,
                        child: Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.08),
                            borderRadius: AppRadius.rMd,
                          ),
                          child: const Icon(
                            Icons.person_add_rounded,
                            color: AppColors.primary,
                            size: 20,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

          // ── Contact List ────────────────────────
          Expanded(
            child: BlocBuilder<ContactsCubit, ContactsState>(
              builder: (context, state) {
                if (state.isLoading && state.contacts.isEmpty) {
                  return const Center(child: CircularProgressIndicator(color: AppColors.primary));
                }

                if (state.error != null && state.contacts.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.wifi_off_rounded,
                            size: 40,
                            color: AppColors.textMuted),
                        const SizedBox(height: 12),
                        const Text('Could not load contacts',
                            style: AppText.body),
                        const SizedBox(height: 8),
                        TextButton(
                          onPressed: () =>
                              context.read<ContactsCubit>().loadContacts(),
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  );
                }

                if (state.contacts.isEmpty) {
                  return _buildEmptyState(context);
                }

                return Column(
                  children: [
                    Expanded(
                        child: _buildContactsList(context, state.contacts)),
                    _buildPaginationBar(context, state),
                  ],
                );
              },
            ),
          ),
        ],
      );
  }

  // ── Pagination Bar ──
  Widget _buildPaginationBar(BuildContext context, ContactsState state) {
    final theme = Theme.of(context);
    final totalPages = (state.totalContacts / state.limit).ceil();
    if (totalPages <= 1) return const SizedBox.shrink();

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
            onPressed: state.page > 1 ? () => _goToPage(state.page - 1) : null,
            icon: const Icon(Icons.chevron_left_rounded),
            iconSize: 20,
          ),
          ...List.generate(totalPages > 7 ? 7 : totalPages, (i) {
            int pageNum;
            if (totalPages <= 7) {
              pageNum = i + 1;
            } else if (state.page <= 4) {
              pageNum = i + 1;
            } else if (state.page >= totalPages - 3) {
              pageNum = totalPages - 6 + i;
            } else {
              pageNum = state.page - 3 + i;
            }
            final isCurrent = pageNum == state.page;
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: isCurrent ? null : () => _goToPage(pageNum),
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
                    '$pageNum',
                    style: TextStyle(
                      color: isCurrent
                          ? Colors.white
                          : theme.colorScheme.onSurface.withValues(alpha: 0.6),
                      fontWeight:
                          isCurrent ? FontWeight.w600 : FontWeight.normal,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            );
          }),
          IconButton(
            onPressed: state.page < totalPages
                ? () => _goToPage(state.page + 1)
                : null,
            icon: const Icon(Icons.chevron_right_rounded),
            iconSize: 20,
          ),
          const SizedBox(width: 16),
          Text(
            'Page ${state.page} of $totalPages',
            style: TextStyle(
                fontSize: 12,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
          ),
        ],
      ),
    );
  }

  void _goToPage(int page) {
    context.read<ContactsCubit>().loadContacts(page: page);
  }


  // ── Mobile Contact List (ListView) ──
  Widget _buildContactsList(
      BuildContext context, List<ContactEntity> contacts) {
    final theme = Theme.of(context);
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      itemCount: contacts.length,
      itemBuilder: (context, index) {
        final contact = contacts[index];
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          elevation: 0,
          color: Colors.white,
          child: InkWell(
            onTap: () => _showContactDetail(context, contact),
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor:
                        AvatarColors.getBackgroundColor(contact.displayName),
                    child: Text(
                      contact.displayName.isNotEmpty
                          ? contact.displayName[0].toUpperCase()
                          : '?',
                      style: TextStyle(
                          color: AvatarColors.getColor(contact.displayName),
                          fontWeight: FontWeight.w700,
                          fontSize: 16),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          contact.displayName,
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(fontWeight: FontWeight.w600),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 3),
                        Text(
                          contact.phone ??
                              contact.email ??
                              contact.whatsappId ??
                              'No contact info',
                          style: TextStyle(
                              fontSize: 12,
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.45)),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  if (contact.tags.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        contact.tags.first,
                        style: TextStyle(
                            fontSize: 10,
                            color: theme.colorScheme.primary,
                            fontWeight: FontWeight.w600),
                      ),
                    ),
                  if (contact.sourceChannel != null) ...[
                    const SizedBox(width: 6),
                    _sourceChip(contact.sourceChannel),
                  ],
                  const SizedBox(width: 4),
                  Icon(Icons.chevron_right_rounded,
                      size: 20,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.25)),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  // ── Contact Detail Content (shared by dialog and bottom sheet) ──
  Widget _buildContactDetailContent(
      ThemeData theme, ContactEntity contact, BuildContext ctx) {
    return Container(
      constraints: const BoxConstraints(maxHeight: 600),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle for bottom sheet
          Container(
            margin: const EdgeInsets.only(top: 12, bottom: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
                color: theme.dividerColor,
                borderRadius: BorderRadius.circular(2)),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor:
                      AvatarColors.getBackgroundColor(contact.displayName),
                  child: Text(
                    contact.displayName.isNotEmpty
                        ? contact.displayName[0].toUpperCase()
                        : '?',
                    style: TextStyle(
                        color: AvatarColors.getColor(contact.displayName),
                        fontWeight: FontWeight.bold,
                        fontSize: 22),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(contact.displayName,
                          style: theme.textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.bold)),
                      if (contact.email != null)
                        Text(contact.email!,
                            style: TextStyle(
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.5),
                                fontSize: 13)),
                    ],
                  ),
                ),
                IconButton(
                    onPressed: () => Navigator.pop(ctx),
                    icon: const Icon(Icons.close_rounded)),
              ],
            ),
          ),
          const Divider(height: 1),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _detailSection(theme, 'Contact Info', [
                    _detailRowWithCopy(ctx, theme, Icons.phone_rounded, 'Phone',
                        contact.phone ?? '-'),
                    _detailRow(theme, Icons.email_rounded, 'Email',
                        contact.email ?? '-'),
                    _detailRowWithCopy(ctx, theme, Icons.chat_rounded,
                        'WhatsApp', contact.whatsappId ?? '-'),
                    _detailRow(theme, Icons.campaign_rounded, 'Source',
                        _sourceLabel(contact.sourceChannel)),
                  ]),
                  const SizedBox(height: 20),
                  _detailSection(theme, 'Activity', [
                    _detailRow(
                        theme,
                        Icons.access_time_rounded,
                        'Last Seen',
                        contact.lastSeenAt != null
                            ? _formatDate(contact.lastSeenAt!)
                            : 'Never'),
                    _detailRow(theme, Icons.calendar_today_rounded, 'Created',
                        _formatDate(contact.createdAt)),
                  ]),
                  if (contact.tags.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    _detailSection(theme, 'Tags', [
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: contact.tags
                            .map((tag) => Chip(
                                  label: Text(tag,
                                      style: TextStyle(
                                          fontSize: 12,
                                          color: theme.colorScheme.primary,
                                          fontWeight: FontWeight.w600)),
                                  backgroundColor: theme.colorScheme.primary
                                      .withValues(alpha: 0.1),
                                  side: BorderSide.none,
                                ))
                            .toList(),
                      ),
                    ]),
                  ],
                  if (contact.notes != null && contact.notes!.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    _detailSection(theme, 'Notes', [
                      Text(contact.notes!,
                          style: TextStyle(
                              fontSize: 13,
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.7))),
                    ]),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Contact 360° Detail Dialog ──
  void _showContactDetail(BuildContext context, ContactEntity contact) {
    final theme = Theme.of(context);
    final isDesktop = kIsWeb || MediaQuery.of(context).size.width >= 768;

    if (!isDesktop) {
      // Mobile: full-screen bottom sheet
      showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (ctx) => _buildContactDetailContent(theme, contact, ctx),
      );
      return;
    }

    // Desktop: dialog
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: SizedBox(
          width: 560,
          child: _buildContactDetailContent(theme, contact, ctx),
        ),
      ),
    );
  }

  Widget _detailSection(ThemeData theme, String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title,
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
                letterSpacing: 0.5)),
        const SizedBox(height: 10),
        ...children,
      ],
    );
  }

  Widget _detailRow(
      ThemeData theme, IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon,
              size: 16, color: theme.colorScheme.primary.withValues(alpha: 0.6)),
          const SizedBox(width: 10),
          SizedBox(
              width: 80,
              child: Text(label,
                  style: TextStyle(
                      fontSize: 12,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5)))),
          Expanded(
              child: Text(value,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }

  Widget _detailRowWithCopy(BuildContext ctx, ThemeData theme, IconData icon,
      String label, String value) {
    final hasCopyable = value.isNotEmpty && value != '-';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon,
              size: 16, color: theme.colorScheme.primary.withValues(alpha: 0.6)),
          const SizedBox(width: 10),
          SizedBox(
              width: 80,
              child: Text(label,
                  style: TextStyle(
                      fontSize: 12,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5)))),
          Flexible(
            child: Text.rich(
              TextSpan(
                text: value,
                children: [
                  if (hasCopyable)
                    WidgetSpan(
                      alignment: PlaceholderAlignment.middle,
                      child: Padding(
                        padding: const EdgeInsets.only(left: 8),
                        child: GestureDetector(
                          onTap: () {
                            Clipboard.setData(ClipboardData(text: value));
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              SnackBar(
                                content: Text('$label copied to clipboard'),
                                behavior: SnackBarBehavior.floating,
                                width: 280,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(10)),
                                duration: const Duration(seconds: 2),
                              ),
                            );
                          },
                          child: Tooltip(
                            message: 'Copy $label',
                            child: Icon(
                              Icons.copy_rounded,
                              size: 15,
                              color:
                                  theme.colorScheme.onSurface.withValues(alpha: 0.4),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime dt) {
    final now = DateTime.now();
    if (dt.year == now.year && dt.month == now.month && dt.day == now.day) {
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    }
    if (dt.year == now.year && dt.month == now.month && dt.day == now.day - 1) {
      return 'Yesterday';
    }
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  // ── Source channel label / chip / colour ──
  String _sourceLabel(String? code) =>
      src.prettySourceChannel(code, fallback: 'Unknown');

  Color _sourceColor(String? code) => src.sourceChannelColor(code);

  Widget _sourceChip(String? code) {
    final label = _sourceLabel(code);
    final color = _sourceColor(code);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.25), width: 1),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color,
          letterSpacing: 0.2,
        ),
      ),
    );
  }


  Widget _buildEmptyState(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF2D9CDB).withValues(alpha: 0.1)),
            child: const Icon(Icons.people_rounded,
                size: 48, color: Color(0xFF2D9CDB)),
          ),
          const SizedBox(height: 20),
          Text('No contacts yet',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text(
            'Contacts will appear here when customers\nmessage you or when you add them manually.',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: () => _showAddContactDialog(context),
            icon: const Icon(Icons.person_add_rounded, size: 18),
            label: const Text('Add First Contact'),
          ),
        ],
      ),
    );
  }

  void _showAddContactDialog(BuildContext context) {
    _nameController.clear();
    _phoneController.clear();
    _emailController.clear();
    _whatsappController.clear();

    final theme = Theme.of(context);
    final isDesktop = kIsWeb || MediaQuery.of(context).size.width >= 768;

    Widget formContent(BuildContext dialogContext) {
      return Padding(
        padding: EdgeInsets.only(
          left: 24,
          right: 24,
          top: 20,
          bottom: MediaQuery.of(dialogContext).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Add New Contact',
                style: theme.textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 24),
            TextField(
                controller: _nameController,
                decoration: const InputDecoration(
                    labelText: 'Full Name',
                    prefixIcon: Icon(Icons.person_rounded))),
            const SizedBox(height: 16),
            TextField(
                controller: _phoneController,
                decoration: const InputDecoration(
                    labelText: 'Phone Number',
                    prefixIcon: Icon(Icons.phone_rounded),
                    hintText: '+62...')),
            const SizedBox(height: 16),
            TextField(
                controller: _emailController,
                decoration: const InputDecoration(
                    labelText: 'Email (optional)',
                    prefixIcon: Icon(Icons.email_rounded))),
            const SizedBox(height: 16),
            TextField(
                controller: _whatsappController,
                decoration: const InputDecoration(
                    labelText: 'WhatsApp ID',
                    prefixIcon: Icon(Icons.chat_rounded),
                    hintText: '628...')),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                    onPressed: () => Navigator.pop(dialogContext),
                    child: const Text('Cancel')),
                const SizedBox(width: 12),
                BlocBuilder<ContactsCubit, ContactsState>(
                  builder: (ctx, state) {
                    return ElevatedButton(
                      onPressed: state.isCreating
                          ? null
                          : () async {
                              final success = await context
                                  .read<ContactsCubit>()
                                  .createContact(
                                    name: _nameController.text.trim().isEmpty
                                        ? null
                                        : _nameController.text.trim(),
                                    phone: _phoneController.text.trim().isEmpty
                                        ? null
                                        : _phoneController.text.trim(),
                                    email: _emailController.text.trim().isEmpty
                                        ? null
                                        : _emailController.text.trim(),
                                    whatsappId:
                                        _whatsappController.text.trim().isEmpty
                                            ? null
                                            : _whatsappController.text.trim(),
                                  );
                              if (success && dialogContext.mounted) {
                                Navigator.pop(dialogContext);
                              }
                            },
                      child: state.isCreating
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Add Contact'),
                    );
                  },
                ),
              ],
            ),
          ],
        ),
      );
    }

    if (isDesktop) {
      showDialog(
        context: context,
        builder: (dialogContext) => Dialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          child: SizedBox(width: 440, child: formContent(dialogContext)),
        ),
      );
    } else {
      showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (ctx) => SingleChildScrollView(child: formContent(ctx)),
      );
    }
  }
}
