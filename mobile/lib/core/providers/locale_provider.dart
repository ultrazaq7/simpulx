import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/app_cache.dart';
import 'app_providers.dart';

/// App locale override. `null` means follow the device locale.
class LocaleController extends Notifier<Locale?> {
  @override
  Locale? build() {
    final code = ref.read(appCacheProvider).getString(AppCache.kLocale);
    return (code == null || code.isEmpty) ? null : Locale(code);
  }

  Future<void> setLocale(Locale? locale) async {
    final cache = ref.read(appCacheProvider);
    if (locale == null) {
      await cache.remove(AppCache.kLocale);
    } else {
      await cache.setString(AppCache.kLocale, locale.languageCode);
    }
    state = locale;
  }
}

final localeProvider =
    NotifierProvider<LocaleController, Locale?>(LocaleController.new);
