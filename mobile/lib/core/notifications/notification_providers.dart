import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'push_service.dart';

final pushServiceProvider = Provider<PushService>((ref) => PushService());
