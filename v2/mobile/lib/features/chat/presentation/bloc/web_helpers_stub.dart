// Stub implementation for non-web platforms
// These classes do nothing on mobile - they are web-only features.

class FaviconBadge {
  static void update(int count) {
    // No-op on mobile
  }
}

class BrowserNotification {
  static void requestPermission() {
    // No-op on mobile
  }

  static void show({required String title, String? body, String? tag}) {
    // No-op on mobile
  }
}
