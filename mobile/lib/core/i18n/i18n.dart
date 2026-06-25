import 'package:flutter/widgets.dart';

import 'strings_id.g.dart';

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
}

/// Context sugar: `context.tr('Some text')` for places where an extension on a
/// literal reads awkwardly.
extension TrContext on BuildContext {
  String tr(String source) => source.tr(this);
}
