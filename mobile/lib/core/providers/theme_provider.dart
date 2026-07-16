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

/// The REAL device brightness, bypassing any app-level override.
///
/// [MediaQuery.platformBrightnessOf] can't be trusted right after a theme switch:
/// [_mirrorThemeToNative] pushes the user's pick into the SYSTEM via
/// `UiModeManager`, so immediately after selecting "System Default" the platform
/// brightness still reports the PREVIOUS manual pick (e.g. light) even though the
/// device itself is dark — which made the confirmation toast render inverted.
/// The native `getSystemBrightness` reads `Resources.getSystem()` directly, which
/// the app's own override never touches.
Future<Brightness> deviceSystemBrightness({required Brightness fallback}) async {
  if (Platform.isAndroid) {
    try {
      final v = await _nativeChannel.invokeMethod<String>('getSystemBrightness');
      if (v == 'dark') return Brightness.dark;
      if (v == 'light') return Brightness.light;
    } catch (_) {
      // Fall back to the Flutter-reported brightness.
    }
  }
  return fallback;
}

/// App theme mode override. Persists to local cache.
///
/// Uses Flutter's built-in [ThemeMode.system] for the "System Default" option,
/// which tracks the device's brightness via [platformBrightness]. On Android
/// the splash theme is handled separately by [NativeThemeStore.applyToSystem]
/// via `UiModeManager`, so there's no context wrapping that could lock
/// `platformBrightness`.
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
