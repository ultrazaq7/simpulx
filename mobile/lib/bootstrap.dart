import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'core/notifications/push_service.dart';
import 'core/providers/app_providers.dart';
import 'core/storage/app_cache.dart';
import 'features/auth/presentation/controllers/auth_controller.dart';

/// Composition root: initialize Hive, build the provider container with runtime
/// overrides, resolve the session, and run the app.
///
/// Firebase/FCM initialization is intentionally deferred to P1/P6 (it requires
/// the native config files) so the foundation runs without them.
Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase + background push handler. Wrapped so a missing/instrumented
  // config never blocks startup (e.g. running without google-services).
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  } catch (e) {
    debugPrint('Firebase init skipped: $e');
  }

  final cache = await AppCache.init();

  final container = ProviderContainer(
    overrides: [
      appCacheProvider.overrideWithValue(cache),
    ],
  );

  // iOS keeps Keychain entries across an app UNINSTALL (Android wipes them), so
  // flutter_secure_storage handed a REINSTALLED app the previous session's tokens
  // and it silently logged straight back in — uninstalling never signed you out.
  // The Hive box above lives in app storage, which IS wiped on uninstall, so its
  // marker being absent means "fresh install": drop the stale credentials before
  // anything reads them.
  if (Platform.isIOS && cache.getString(AppCache.kInstallMarker) == null) {
    try {
      await container.read(secureStoreProvider).clear();
      debugPrint('Fresh install detected: cleared leftover Keychain session');
    } catch (e) {
      debugPrint('Fresh-install keychain clear failed: $e');
    }
  }
  await cache.setString(AppCache.kInstallMarker, '1');

  // Resolve auth status before the first frame to avoid a login flash.
  await container.read(authControllerProvider.notifier).bootstrap();

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const SimpulxApp(),
    ),
  );
}
