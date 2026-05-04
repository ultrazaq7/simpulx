// ============================================================
// Simpulx Design System Widgets
// ============================================================
// Reusable building blocks for a consistent look across every
// page. All widgets follow the same token set in `app_style.dart`.
//
// Widgets exported:
//   AppPageHeader       - Title + subtitle + primary CTA button (top of page)
//   AppCard             - Bordered white surface with soft shadow
//   AppSearchField      - Consistent rounded search input (pill)
//   AppFilterPill       - Small dropdown-style filter chip
//   AppPrimaryButton    - Filled brand CTA button
//   AppGhostButton      - Transparent link-style button
//   AppStatusBadge      - Pill badge for status / role tags
//   AppTable            - Consistent table with sticky header row
//   AppTableCell        - Cell wrapper (handles overflow + tooltip)
//   AppPagination       - Standardised <<  <  1  >  >> pager
//   AppEmptyState       - Friendly empty state with icon
//
// Use these in preference to raw Container / DataTable / TextField
// so every page has the same border radius, border colour, padding,
// and typography.
// ============================================================

import 'package:flutter/material.dart';
import 'app_style.dart';

// ── Page Header ──────────────────────────────────────────
class AppPageHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final EdgeInsets padding;

  const AppPageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.padding = const EdgeInsets.fromLTRB(24, 20, 24, 16),
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.titleLg),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(subtitle!, style: AppText.subtitle),
                ],
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

// ── Card ─────────────────────────────────────────────────
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final EdgeInsets margin;
  final Color? color;

  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin = EdgeInsets.zero,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: padding,
      decoration: appCardDecoration(color: color),
      child: child,
    );
  }
}

// ── Search Field ─────────────────────────────────────────
class AppSearchField extends StatelessWidget {
  final TextEditingController? controller;
  final String hintText;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onClear;
  final double height;

  const AppSearchField({
    super.key,
    this.controller,
    this.hintText = 'Search...',
    this.onChanged,
    this.onClear,
    this.height = 40,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        style: AppText.body,
        decoration: InputDecoration(
          hintText: hintText,
          hintStyle: const TextStyle(color: AppColors.textMuted, fontSize: 13),
          prefixIcon: const Icon(Icons.search_rounded,
              size: 18, color: AppColors.textMuted),
          prefixIconConstraints:
              const BoxConstraints(minWidth: 40, minHeight: 40),
          suffixIcon: onClear != null && (controller?.text.isNotEmpty ?? false)
              ? IconButton(
                  icon: const Icon(Icons.close_rounded,
                      size: 16, color: AppColors.textMuted),
                  onPressed: onClear,
                )
              : null,
          filled: true,
          fillColor: AppColors.surfaceAlt,
          contentPadding: const EdgeInsets.symmetric(vertical: 8),
          isDense: true,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.pill),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.pill),
            borderSide: const BorderSide(color: AppColors.border, width: 1),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.pill),
            borderSide: const BorderSide(color: AppColors.primary, width: 1.2),
          ),
        ),
      ),
    );
  }
}

// ── Filter Pill (dropdown-style chip) ────────────────────
class AppFilterPill extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final bool active;

  const AppFilterPill({
    super.key,
    required this.label,
    this.icon,
    this.onTap,
    this.active = false,
  });

  @override
  Widget build(BuildContext context) {
    final fg = active ? AppColors.primary : AppColors.textSecondary;
    final border = active ? AppColors.primary : AppColors.border;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: active
                ? AppColors.primary.withOpacity(0.05)
                : AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadius.pill),
            border: Border.all(color: border, width: 1),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 14, color: fg),
                const SizedBox(width: 6),
              ],
              Text(label,
                  style: TextStyle(
                      fontSize: 12, color: fg, fontWeight: FontWeight.w600)),
              const SizedBox(width: 4),
              Icon(Icons.keyboard_arrow_down_rounded, size: 16, color: fg),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Primary Button (filled) ──────────────────────────────
class AppPrimaryButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool loading;

  const AppPrimaryButton({
    super.key,
    required this.label,
    this.icon,
    this.onPressed,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      onPressed: loading ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.textInverse,
        disabledBackgroundColor: AppColors.primary.withOpacity(0.5),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md)),
        textStyle: AppText.button,
      ),
      icon: loading
          ? const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                  strokeWidth: 2, color: Colors.white))
          : (icon != null ? Icon(icon, size: 16) : const SizedBox.shrink()),
      label: Text(label),
    );
  }
}

// ── Ghost / secondary button ─────────────────────────────
class AppGhostButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;

  const AppGhostButton(
      {super.key, required this.label, this.icon, this.onPressed});

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: AppColors.textSecondary,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md)),
        textStyle: AppText.button,
      ),
      icon: icon != null ? Icon(icon, size: 16) : const SizedBox.shrink(),
      label: Text(label),
    );
  }
}

// ── Status Badge ─────────────────────────────────────────
class AppStatusBadge extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;

  const AppStatusBadge({
    super.key,
    required this.label,
    required this.color,
    this.icon,
  });

  factory AppStatusBadge.success(String label, {IconData? icon}) =>
      AppStatusBadge(label: label, color: AppColors.success, icon: icon);
  factory AppStatusBadge.danger(String label, {IconData? icon}) =>
      AppStatusBadge(label: label, color: AppColors.danger, icon: icon);
  factory AppStatusBadge.warning(String label, {IconData? icon}) =>
      AppStatusBadge(label: label, color: AppColors.warning, icon: icon);
  factory AppStatusBadge.info(String label, {IconData? icon}) =>
      AppStatusBadge(label: label, color: AppColors.primary, icon: icon);
  factory AppStatusBadge.neutral(String label, {IconData? icon}) =>
      AppStatusBadge(label: label, color: AppColors.textSecondary, icon: icon);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(color: color.withOpacity(0.2), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label.toUpperCase(),
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: color,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Table ────────────────────────────────────────────────
class AppTableColumn {
  final String label;
  final double? fixedWidth;
  final int flex;
  final Alignment align;

  const AppTableColumn({
    required this.label,
    this.fixedWidth,
    this.flex = 1,
    this.align = Alignment.centerLeft,
  });
}

class AppTable extends StatelessWidget {
  final List<AppTableColumn> columns;
  final List<List<Widget>> rows;
  final double rowHeight;
  final double headerHeight;
  final EdgeInsets contentPadding;
  final bool striped;

  const AppTable({
    super.key,
    required this.columns,
    required this.rows,
    this.rowHeight = 56,
    this.headerHeight = 48,
    this.contentPadding = const EdgeInsets.symmetric(horizontal: 20),
    this.striped = false,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: Container(
        decoration: appCardDecoration(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header
            Container(
              height: headerHeight,
              padding: contentPadding,
              decoration: const BoxDecoration(
                color: AppColors.surfaceAlt,
                border: Border(
                    bottom: BorderSide(color: AppColors.border, width: 1)),
              ),
              child: Row(children: [
                for (final col in columns)
                  _cell(col, Text(col.label, style: AppText.label)),
              ]),
            ),
            // Rows
            ...rows.asMap().entries.map((entry) {
              final idx = entry.key;
              final row = entry.value;
              final bg = striped && idx.isOdd
                  ? AppColors.surfaceAlt
                  : AppColors.surface;
              return Container(
                constraints: BoxConstraints(minHeight: rowHeight),
                padding: contentPadding.copyWith(top: 8, bottom: 8),
                decoration: BoxDecoration(
                  color: bg,
                  border: idx < rows.length - 1
                      ? const Border(
                          bottom: BorderSide(color: AppColors.border, width: 1))
                      : null,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    for (int i = 0; i < columns.length; i++)
                      _cell(columns[i],
                          i < row.length ? row[i] : const SizedBox.shrink()),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  Widget _cell(AppTableColumn col, Widget child) {
    Widget wrapped = Align(alignment: col.align, child: child);
    if (col.fixedWidth != null) {
      return SizedBox(width: col.fixedWidth, child: wrapped);
    }
    return Expanded(flex: col.flex, child: wrapped);
  }
}

// ── Pagination ───────────────────────────────────────────
class AppPagination extends StatelessWidget {
  final int currentPage;
  final int totalPages;
  final int totalItems;
  final String itemLabel;
  final ValueChanged<int> onPageChanged;

  const AppPagination({
    super.key,
    required this.currentPage,
    required this.totalPages,
    required this.totalItems,
    required this.onPageChanged,
    this.itemLabel = 'items',
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      child: Row(
        children: [
          Text('$currentPage / $totalPages $itemLabel',
              style: AppText.bodyMuted),
          const Spacer(),
          Row(children: [
            _navBtn(Icons.keyboard_double_arrow_left_rounded,
                currentPage > 1 ? () => onPageChanged(1) : null),
            _navBtn(Icons.chevron_left_rounded,
                currentPage > 1 ? () => onPageChanged(currentPage - 1) : null),
            ..._pageNumbers().map((p) => _pageBtn(p)),
            _navBtn(
                Icons.chevron_right_rounded,
                currentPage < totalPages
                    ? () => onPageChanged(currentPage + 1)
                    : null),
            _navBtn(
                Icons.keyboard_double_arrow_right_rounded,
                currentPage < totalPages
                    ? () => onPageChanged(totalPages)
                    : null),
          ]),
        ],
      ),
    );
  }

  List<int> _pageNumbers() {
    // Show up to 5 pages around current
    if (totalPages <= 5) return List.generate(totalPages, (i) => i + 1);
    int start = (currentPage - 2).clamp(1, totalPages - 4);
    return List.generate(5, (i) => start + i);
  }

  Widget _navBtn(IconData icon, VoidCallback? onTap) {
    final enabled = onTap != null;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          child: SizedBox(
            width: 30,
            height: 30,
            child: Icon(icon,
                size: 16,
                color: enabled
                    ? AppColors.textSecondary
                    : AppColors.textMuted.withOpacity(0.4)),
          ),
        ),
      ),
    );
  }

  Widget _pageBtn(int page) {
    final active = page == currentPage;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Material(
        color: active ? AppColors.primary : Colors.transparent,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        child: InkWell(
          onTap: active ? null : () => onPageChanged(page),
          borderRadius: BorderRadius.circular(AppRadius.sm),
          child: Container(
            width: 30,
            height: 30,
            alignment: Alignment.center,
            child: Text('$page',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color:
                      active ? AppColors.textInverse : AppColors.textSecondary,
                )),
          ),
        ),
      ),
    );
  }
}

// ── Empty State ──────────────────────────────────────────
class AppEmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  const AppEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: AppColors.surfaceAlt,
              borderRadius: BorderRadius.circular(AppRadius.xl),
            ),
            alignment: Alignment.center,
            child: Icon(icon, size: 28, color: AppColors.textMuted),
          ),
          const SizedBox(height: 16),
          Text(title, style: AppText.sectionTitle),
          if (message != null) ...[
            const SizedBox(height: 6),
            Text(message!,
                style: AppText.bodyMuted, textAlign: TextAlign.center),
          ],
          if (action != null) ...[
            const SizedBox(height: 16),
            action!,
          ],
        ],
      ),
    );
  }
}

// ── Section Divider with title ───────────────────────────
class AppSectionHeader extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  const AppSectionHeader({
    super.key,
    required this.title,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(title, style: AppText.sectionTitle)),
        if (actionLabel != null)
          AppGhostButton(label: actionLabel!, onPressed: onAction),
      ],
    );
  }
}
