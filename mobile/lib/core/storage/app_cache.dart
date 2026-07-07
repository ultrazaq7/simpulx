import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

/// Hive-backed local cache for non-sensitive data: offline snapshots of
/// conversations/contacts/dashboard, user prefs (language, theme), and queued
/// outbound actions. Tokens never live here (see `SecureStore`).
class AppCache {
  AppCache._(this._box);

  final Box _box;

  static const _boxName = 'simpulx_cache';

  /// Box keys.
  static const kLocale = 'locale';
  static const kThemeMode = 'theme_mode';
  static const kCachedUser = 'cached_user';
  static const kConversations = 'conversations_snapshot';
  static const kContacts = 'contacts_snapshot';
  static const kDashboard = 'dashboard_snapshot';

  /// Initialize Hive and open the cache box. Call once during bootstrap.
  static Future<AppCache> init() async {
    await Hive.initFlutter();
    final box = await Hive.openBox(_boxName);
    return AppCache._(box);
  }

  String? getString(String key) => _box.get(key) as String?;
  Future<void> setString(String key, String value) => _box.put(key, value);

  bool? getBool(String key) => _box.get(key) as bool?;
  Future<void> setBool(String key, bool value) => _box.put(key, value);

  /// Store a JSON-serializable map.
  Future<void> setJson(String key, Object value) =>
      _box.put(key, jsonEncode(value));

  /// Read a previously stored JSON map; null if absent or malformed.
  Map<String, dynamic>? getJson(String key) {
    final raw = _box.get(key) as String?;
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  /// Read a previously stored JSON list; null if absent or malformed.
  List<dynamic>? getJsonList(String key) {
    final raw = _box.get(key) as String?;
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as List<dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<void> remove(String key) => _box.delete(key);
  Future<void> clear() => _box.clear();
}
