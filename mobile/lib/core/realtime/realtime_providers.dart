import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/app_providers.dart';
import '../session/session_controller.dart';
import 'realtime_client.dart';
import 'realtime_event.dart';

/// The app-wide realtime client. Connects while the session is authenticated
/// and stops on logout. Kept alive by whoever watches it (the shell + chat
/// controllers).
final realtimeClientProvider = Provider<RealtimeClient>((ref) {
  final client = RealtimeClient(
    config: ref.watch(appConfigProvider),
    secureStore: ref.watch(secureStoreProvider),
  );
  ref.onDispose(client.dispose);

  ref.listen<SessionState>(
    sessionControllerProvider,
    (_, next) {
      if (next.status == SessionStatus.authenticated) {
        client.start();
      } else {
        client.stop();
      }
    },
    fireImmediately: true,
  );

  return client;
});

/// Broadcast stream of decoded realtime events.
final realtimeEventsProvider = StreamProvider<RealtimeEvent>((ref) {
  return ref.watch(realtimeClientProvider).events;
});

/// Connection status for a subtle UI indicator.
final realtimeStatusProvider = StreamProvider<RealtimeStatus>((ref) {
  return ref.watch(realtimeClientProvider).status;
});
