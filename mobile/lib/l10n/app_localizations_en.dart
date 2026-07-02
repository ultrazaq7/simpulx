// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Simpulx';

  @override
  String get navDashboard => 'Dashboard';

  @override
  String get navChat => 'Chat';

  @override
  String get navContacts => 'Leads';

  @override
  String get navSettings => 'Settings';

  @override
  String get commonRetry => 'Retry';

  @override
  String get commonCancel => 'Cancel';

  @override
  String get commonSave => 'Save';

  @override
  String get commonSearch => 'Search';

  @override
  String get commonLoading => 'Loading';

  @override
  String get commonError => 'Something went wrong';

  @override
  String get commonEmpty => 'Nothing here yet';

  @override
  String get commonNoConnection => 'No internet connection';

  @override
  String get authSignIn => 'Sign in';

  @override
  String get authEmail => 'Email';

  @override
  String get authPassword => 'Password';

  @override
  String get authForgotPassword => 'Forgot password?';

  @override
  String get authSignInToContinue => 'Sign in to continue';

  @override
  String get authSessionExpired =>
      'Your session has expired. Please sign in again.';

  @override
  String get settingsProfile => 'Profile';

  @override
  String get settingsPresence => 'Online status';

  @override
  String get settingsLanguage => 'Language';

  @override
  String get settingsNotifications => 'Notifications';

  @override
  String get settingsAccount => 'Account';

  @override
  String get settingsWorkspace => 'Workspace';

  @override
  String get settingsSignOut => 'Sign out';

  @override
  String get settingsOnline => 'Online';

  @override
  String get settingsOffline => 'Offline';

  @override
  String get dashboardTitle => 'Today';

  @override
  String get chatTitle => 'Chats';

  @override
  String get contactsTitle => 'Contacts';
}
