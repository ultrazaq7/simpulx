import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/app_cache.dart';
import '../providers/app_providers.dart';

/// App theme mode override. Persists to local cache.
class ThemeModeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    final raw = ref.read(appCacheProvider).getString(AppCache.kThemeMode);
    switch (raw) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      default:
        return ThemeMode.system;
    }
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    final cache = ref.read(appCacheProvider);
    switch (mode) {
      case ThemeMode.light:
        await cache.setString(AppCache.kThemeMode, 'light');
      case ThemeMode.dark:
        await cache.setString(AppCache.kThemeMode, 'dark');
      case ThemeMode.system:
        await cache.remove(AppCache.kThemeMode);
    }
    state = mode;
  }
}

final themeModeProvider =
    NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);
