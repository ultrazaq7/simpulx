import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:simpulx/core/theme/app_theme.dart';
import 'package:simpulx/core/di/injection_container.dart' as di;
import 'package:simpulx/core/router/app_router.dart';
import 'package:simpulx/core/network/notification_service.dart';
import 'package:simpulx/features/auth/presentation/bloc/auth_bloc.dart';
import 'package:simpulx/features/chat/presentation/bloc/chat_bloc.dart';
import 'package:simpulx/features/contacts/presentation/bloc/contacts_cubit.dart';
import 'package:simpulx/features/quick_replies/presentation/bloc/quick_replies_cubit.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await di.init();

  // Initialize push notifications (mobile only)
  if (!kIsWeb) {
    await NotificationService.init();
  }

  final authBloc = di.sl<AuthBloc>()..add(CheckAuthStatusEvent());
  AppRouter.init(authBloc);

  runApp(ProviderScope(child: SimpulxApp(authBloc: authBloc)));
}

class SimpulxApp extends StatelessWidget {
  final AuthBloc authBloc;
  const SimpulxApp({super.key, required this.authBloc});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<AuthBloc>.value(
          value: authBloc,
        ),
        BlocProvider<ConversationCubit>(
          create: (_) => di.sl<ConversationCubit>(),
        ),
        BlocProvider<ChatBloc>(
          create: (_) => di.sl<ChatBloc>(),
        ),
        BlocProvider<ContactsCubit>(
          create: (_) => di.sl<ContactsCubit>(),
        ),
        BlocProvider<QuickRepliesCubit>(
          create: (_) => di.sl<QuickRepliesCubit>(),
        ),
      ],
      child: MaterialApp.router(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        darkTheme: AppTheme.darkTheme,
        themeMode: ThemeMode.light,
        builder: (context, child) {
          final media = MediaQuery.of(context);
          return MediaQuery(
            data: media.copyWith(
              textScaler: media.textScaler.clamp(
                maxScaleFactor: kIsWeb ? 1.05 : 1.12,
              ),
            ),
            child: child ?? const SizedBox.shrink(),
          );
        },
        routerConfig: AppRouter.router,
      ),
    );
  }
}
