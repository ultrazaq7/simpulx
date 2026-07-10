import 'package:flutter/widgets.dart';

import 'strings_id.g.dart';

/// The active language code, mirrored from the locale controller so non-widget
/// code (notifications, background isolates) can localize without a
/// [BuildContext]. Kept in sync on app start and whenever the language changes.
String? kActiveLocaleCode;

/// Context-free translation of an English [source] string, using
/// [kActiveLocaleCode]. Falls back to English. Use ONLY where no [BuildContext]
/// is available (e.g. building a notification) — prefer `'text'.tr(context)`.
String trStatic(String source) =>
    kActiveLocaleCode == 'id' ? (kStringsId[source] ?? source) : source;

/// Same as [trStatic] but substitutes `{key}` placeholders from [args].
String trpStatic(String source, Map<String, Object?> args) {
  var out = trStatic(source);
  args.forEach((k, v) => out = out.replaceAll('{$k}', '${v ?? ''}'));
  return out;
}

/// Lightweight runtime i18n for the large set of in-feature strings, layered on
/// top of the generated [AppLocalizations] (which keeps the nav + a few core
/// keys). The ENGLISH source string is the key, so wiring a screen is just
/// `'Some text'.tr(context)`.
///
/// Crucially this is GRACEFUL: any string missing from the active locale map
/// falls back to its English source, so a screen is never half-broken — it's
/// either translated or English, never garbled. That lets translation coverage
/// grow incrementally and safely.
extension Tr on String {
  String tr(BuildContext context) {
    switch (Localizations.localeOf(context).languageCode) {
      case 'id':
        return kStringsId[this] ?? this;
      default:
        return this;
    }
  }

  /// Like [tr] but substitutes `{key}` placeholders from [args] AFTER resolving
  /// the template, so the source (with `{key}` tokens) stays the map key and
  /// translations can reorder tokens to fit target-language grammar. Example:
  /// `'Send "{name}"?'.trp(context, {'name': b.name})`.
  String trp(BuildContext context, Map<String, Object?> args) {
    var out = tr(context);
    args.forEach((k, v) => out = out.replaceAll('{$k}', '${v ?? ''}'));
    return out;
  }
}

/// Context sugar: `context.tr('Some text')` for places where an extension on a
/// literal reads awkwardly.
extension TrContext on BuildContext {
  String tr(String source) => source.tr(this);
}
