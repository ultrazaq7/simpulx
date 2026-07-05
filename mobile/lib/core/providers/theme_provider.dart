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
///
/// On Android the Activity's base context may have been wrapped with a forced
/// night-mode for splash theming (see [NativeThemeStore.wrap] in Kotlin).
/// That makes Flutter's [platformBrightness] stale: [ThemeMode.system] would
/// resolve against the *previous* manual choice instead of the real device
/// theme. To work around this, when the user selects "System Default" on
/// Android, we query the real device brightness via `getSystemBrightness`
/// and set an explicit [ThemeMode]. [userPreference] keeps the original
/// "system" selection for the settings UI.
class ThemeModeController extends Notifier<ThemeMode> {
  /// What the user actually selected. May differ from [state] when we resolve
  /// "system" to an explicit light/dark on Android.
  ThemeMode _userPreference = ThemeMode.system;
  ThemeMode get userPreference => _userPreference;

  @override
  ThemeMode build() {
    final raw = ref.read(appCacheProvider).getString(AppCache.kThemeMode);
    final mode = switch (raw) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
    _userPreference = mode;
    // Covers installs that picked a theme before native mirroring existed.
    _mirrorThemeToNative(raw ?? 'system');
    return mode;
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    _userPreference = mode;
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

    // On Android, attachBaseContext may have locked platformBrightness to
    // the previous manual theme.  Query the real device brightness and use
    // an explicit ThemeMode so the UI updates immediately.
    if (mode == ThemeMode.system && Platform.isAndroid) {
      try {
        final brightness =
            await _nativeChannel.invokeMethod<String>('getSystemBrightness');
        state = brightness == 'dark' ? ThemeMode.dark : ThemeMode.light;
      } catch (_) {
        state = mode; // fallback
      }
    } else {
      state = mode;
    }
  }
}

final themeModeProvider =
    NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);

