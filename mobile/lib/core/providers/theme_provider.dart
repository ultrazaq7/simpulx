import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/app_cache.dart';
import '../providers/app_providers.dart';

/// Mirrors the theme choice to native storage (Android) so the NEXT cold
/// start's splash screen resolves against the user's in-app pick instead of
/// always following the OS system theme - Flutter's ThemeMode is Dart-side
/// state that doesn't exist yet when the native splash is drawn.
const _nativeChannel = MethodChannel('simpulx_notification');
Future<void> _mirrorThemeToNative(String mode) async {
  if (!Platform.isAndroid) return;
  try {
    await _nativeChannel.invokeMethod('setThemeMode', {'mode': mode});
  } catch (_) {
    // Best-effort; the in-app theme still applies correctly either way.
  }
}

/// App theme mode override. Persists to local cache.
class ThemeModeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    final raw = ref.read(appCacheProvider).getString(AppCache.kThemeMode);
    final mode = switch (raw) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
    // Covers installs that picked a theme before native mirroring existed.
    _mirrorThemeToNative(raw ?? 'system');
    return mode;
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    final cache = ref.read(appCacheProvider);
    final raw = switch (mode) {
      ThemeMode.light => 'light',
      ThemeMode.dark => 'dark',
      ThemeMode.system => 'system',
    };
    switch (mode) {
      case ThemeMode.light:
        await cache.setString(AppCache.kThemeMode, 'light');
      case ThemeMode.dark:
        await cache.setString(AppCache.kThemeMode, 'dark');
      case ThemeMode.system:
        await cache.remove(AppCache.kThemeMode);
    }
    await _mirrorThemeToNative(raw);
    state = mode;
  }
}

final themeModeProvider =
    NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);
