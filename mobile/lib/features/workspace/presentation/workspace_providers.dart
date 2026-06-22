import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/app_providers.dart';
import '../data/workspace_remote_datasource.dart';
import '../domain/broadcast_summary.dart';

final _workspaceDataSourceProvider = Provider<WorkspaceRemoteDataSource>(
  (ref) => WorkspaceRemoteDataSource(ref.watch(dioProvider)),
);

class BroadcastsController extends AsyncNotifier<List<BroadcastSummary>> {
  WorkspaceRemoteDataSource get _ds => ref.read(_workspaceDataSourceProvider);

  @override
  Future<List<BroadcastSummary>> build() => _ds.listBroadcasts();

  Future<void> refresh() async {
    state = await AsyncValue.guard(_ds.listBroadcasts);
  }

  Future<bool> send(String id) async {
    try {
      await _ds.sendBroadcast(id);
      await refresh();
      return true;
    } catch (_) {
      return false;
    }
  }
}

final broadcastsProvider =
    AsyncNotifierProvider<BroadcastsController, List<BroadcastSummary>>(
  BroadcastsController.new,
);
