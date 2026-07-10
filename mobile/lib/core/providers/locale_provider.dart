import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n.dart';
import '../storage/app_cache.dart';
import 'app_providers.dart';

/// Effective language code (override, else the device locale), for mirroring
/// into [kActiveLocaleCode] so notifications can localize without a context.
String _effectiveCode(String? override) {
  if (override != null && override.isNotEmpty) return override;
  return WidgetsBinding.instance.platformDispatcher.locale.languageCode;
}

/// App locale override. `null` means follow the device locale.
class LocaleController extends Notifier<Locale?> {
  @override
  Locale? build() {
    final code = ref.read(appCacheProvider).getString(AppCache.kLocale);
    final override = (code == null || code.isEmpty) ? null : Locale(code);
    kActiveLocaleCode = _effectiveCode(override?.languageCode);
    return override;
  }

  Future<void> setLocale(Locale? locale) async {
    final cache = ref.read(appCacheProvider);
    if (locale == null) {
      await cache.remove(AppCache.kLocale);
    } else {
      await cache.setString(AppCache.kLocale, locale.languageCode);
    }
    kActiveLocaleCode = _effectiveCode(locale?.languageCode);
    state = locale;
  }
}

final localeProvider =
    NotifierProvider<LocaleController, Locale?>(LocaleController.new);
