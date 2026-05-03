// ============================================================
// Dependency Injection Container (GetIt)
// ============================================================
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:simpulx/core/network/dio_client.dart';
import 'package:simpulx/core/network/websocket_service.dart';
import 'package:simpulx/features/auth/data/datasources/auth_remote_datasource.dart';
import 'package:simpulx/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:simpulx/features/auth/domain/repositories/auth_repository.dart';
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:simpulx/features/audit_log/data/datasources/audit_log_remote_datasource.dart';
import 'package:simpulx/features/chat/data/datasources/chat_remote_datasource.dart';
import 'package:simpulx/features/chat/data/repositories/chat_repository_impl.dart';
import 'package:simpulx/features/chat/domain/repositories/chat_repository.dart';
import 'package:simpulx/features/chat/presentation/bloc/chat_bloc.dart';
import 'package:simpulx/features/contacts/data/datasources/contact_remote_datasource.dart';
import 'package:simpulx/features/contacts/data/repositories/contact_repository_impl.dart';
import 'package:simpulx/features/contacts/domain/repositories/contact_repository.dart';
import 'package:simpulx/features/contacts/presentation/bloc/contacts_cubit.dart';
import 'package:simpulx/features/quick_replies/data/datasources/quick_reply_remote_datasource.dart';
import 'package:simpulx/features/quick_replies/data/repositories/quick_reply_repository_impl.dart';
import 'package:simpulx/features/quick_replies/domain/repositories/quick_reply_repository.dart';
import 'package:simpulx/features/quick_replies/presentation/bloc/quick_replies_cubit.dart';
import 'package:simpulx/features/settings/data/datasources/settings_remote_datasource.dart';

// Simple service locator (can be replaced with get_it for production)
class _ServiceLocator {
  final Map<Type, dynamic> _instances = {};

  T call<T>() => _instances[T] as T;

  void registerSingleton<T>(T instance) {
    _instances[T] = instance;
  }

  void registerFactory<T>(T Function() factory) {
    _instances[T] = factory();
  }
}

final sl = _ServiceLocator();

Future<void> init() async {
  // ── Core ──────────────────────────────────────────────
  const storage = FlutterSecureStorage();
  sl.registerSingleton<FlutterSecureStorage>(storage);

  final dioClient = DioClient(storage: storage);
  sl.registerSingleton<DioClient>(dioClient);

  final wsService = WebSocketService(storage: storage);
  sl.registerSingleton<WebSocketService>(wsService);

  // ── Auth Feature ──────────────────────────────────────
  sl.registerSingleton<AuthRemoteDataSource>(
    AuthRemoteDataSource(client: sl<DioClient>()),
  );

  sl.registerSingleton<AuthRepository>(
    AuthRepositoryImpl(
      remoteDataSource: sl<AuthRemoteDataSource>(),
      storage: sl<FlutterSecureStorage>(),
    ),
  );

  sl.registerSingleton<AuthBloc>(
    AuthBloc(
      authRepository: sl<AuthRepository>(),
      wsService: sl<WebSocketService>(),
    ),
  );

  sl.registerSingleton<AuditLogRemoteDataSource>(
    AuditLogRemoteDataSource(client: sl<DioClient>()),
  );

  // ── Chat Feature ──────────────────────────────────────
  sl.registerSingleton<ChatRemoteDataSource>(
    ChatRemoteDataSource(client: sl<DioClient>()),
  );

  sl.registerSingleton<ChatRepository>(
    ChatRepositoryImpl(
      remoteDataSource: sl<ChatRemoteDataSource>(),
      wsService: sl<WebSocketService>(),
    ),
  );

  sl.registerSingleton<ConversationCubit>(
    ConversationCubit(
      chatRepository: sl<ChatRepository>(),
      wsService: sl<WebSocketService>(),
    ),
  );

  sl.registerSingleton<ChatBloc>(
    ChatBloc(
      chatRepository: sl<ChatRepository>(),
      wsService: sl<WebSocketService>(),
    ),
  );

  // ── Contacts Feature ───────────────────────────────────
  sl.registerSingleton<ContactRemoteDataSource>(
    ContactRemoteDataSource(client: sl<DioClient>()),
  );

  sl.registerSingleton<ContactRepository>(
    ContactRepositoryImpl(
      remoteDataSource: sl<ContactRemoteDataSource>(),
    ),
  );

  sl.registerSingleton<ContactsCubit>(
    ContactsCubit(
      contactRepository: sl<ContactRepository>(),
    ),
  );

  // ── Quick Replies Feature ─────────────────────────────
  sl.registerSingleton<QuickReplyRemoteDataSource>(
    QuickReplyRemoteDataSource(client: sl<DioClient>()),
  );

  sl.registerSingleton<QuickReplyRepository>(
    QuickReplyRepositoryImpl(
      remoteDataSource: sl<QuickReplyRemoteDataSource>(),
    ),
  );

  sl.registerSingleton<QuickRepliesCubit>(
    QuickRepliesCubit(
      repository: sl<QuickReplyRepository>(),
    ),
  );

  // ── Settings Feature ───────────────────────────────────────
  sl.registerSingleton<SettingsRemoteDataSource>(
    SettingsRemoteDataSource(client: sl<DioClient>()),
  );
}
