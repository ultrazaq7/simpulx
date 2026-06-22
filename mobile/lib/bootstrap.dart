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

  // Resolve auth status before the first frame to avoid a login flash.
  await container.read(authControllerProvider.notifier).bootstrap();

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const SimpulxApp(),
    ),
  );
}
