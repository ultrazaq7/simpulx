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
    // Shared with the REST layer so an expired access token gets refreshed for
    // the socket too (single-flight — no refresh-token rotation race).
    refreshToken: ref.watch(tokenRefresherProvider).refresh,
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

/// Fires when the socket was up but we provably MISSED events (a jump in the
/// relay's per-org sequence). Redis pub/sub is fire-and-forget, so this is a real
/// scenario, and nothing else can detect it. Controllers listen and refetch —
/// this is what stops the inbox/leads going quietly stale until a manual reload.
final realtimeGapProvider = StreamProvider<int>((ref) {
  return ref.watch(realtimeClientProvider).gaps;
});

/// Connection status for a subtle UI indicator.
final realtimeStatusProvider = StreamProvider<RealtimeStatus>((ref) {
  return ref.watch(realtimeClientProvider).status;
});
