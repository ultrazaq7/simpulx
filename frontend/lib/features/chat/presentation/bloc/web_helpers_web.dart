// Web implementation - uses dart:html for favicon badge & browser notifications
import 'dart:html' as html;

class FaviconBadge {
  static int _currentCount = 0;
  static bool _observerAttached = false;
  static bool _isUpdating = false;

  static void update(int count) {
    _currentCount = count;
    _applyBadge();
    _attachObserver();
  }

  static void _applyBadge() {
    _isUpdating = true;
    final currentTitle = html.document.title ?? '';
    final baseTitle =
        currentTitle.replaceFirst(RegExp(r'^\(\d+\)\s*'), '');

    if (_currentCount <= 0) {
      if (baseTitle.isNotEmpty) html.document.title = baseTitle;
    } else {
      html.document.title = '($_currentCount) $baseTitle';
    }
    _isUpdating = false;
  }

  /// Re-apply badge when page navigation changes the title
  static void _attachObserver() {
    if (_observerAttached) return;
    _observerAttached = true;

    final titleEl = html.document.querySelector('title');
    if (titleEl == null) return;

    final observer = html.MutationObserver((mutations, _) {
      if (_isUpdating || _currentCount <= 0) return;
      final title = html.document.title ?? '';
      if (!title.startsWith('(')) {
        _applyBadge();
      }
    });

    observer.observe(titleEl, childList: true);
  }
}

class BrowserNotification {
  static bool _permissionRequested = false;

  static void requestPermission() {
    if (_permissionRequested) return;
    _permissionRequested = true;
    if (html.Notification.supported) {
      html.Notification.requestPermission();
    }
  }

  static void show({required String title, String? body, String? tag}) {
    if (!html.Notification.supported) return;
    if (html.Notification.permission != 'granted') return;
    final notification = html.Notification(title, body: body, tag: tag, icon: 'favicon.png');
    // Navigate to conversation when clicked
    notification.onClick.listen((_) {
      if (tag != null && tag.isNotEmpty && !tag.startsWith('new-conv') && !tag.startsWith('snooze-')) {
        // tag contains conversationId — navigate to it
        html.window.location.hash = '/chat/$tag';
      }
      notification.close();
    });
  }
}
