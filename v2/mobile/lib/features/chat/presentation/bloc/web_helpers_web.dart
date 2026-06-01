// Web implementation - uses package:web for favicon badge & browser notifications
import 'package:web/web.dart' as web;
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

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
    final currentTitle = web.document.title;
    final baseTitle =
        currentTitle.replaceFirst(RegExp(r'^\(\d+\)\s*'), '');

    if (_currentCount <= 0) {
      if (baseTitle.isNotEmpty) web.document.title = baseTitle;
    } else {
      web.document.title = '($_currentCount) $baseTitle';
    }
    _isUpdating = false;
  }

  /// Re-apply badge when page navigation changes the title
  static void _attachObserver() {
    if (_observerAttached) return;
    _observerAttached = true;

    final titleEl = web.document.querySelector('title');
    if (titleEl == null) return;

    final observer = web.MutationObserver((JSArray<web.MutationRecord> mutations, web.MutationObserver observer) {
      if (_isUpdating || _currentCount <= 0) return;
      final title = web.document.title;
      if (!title.startsWith('(')) {
        _applyBadge();
      }
    }.toJS);

    observer.observe(titleEl, web.MutationObserverInit(childList: true));
  }
}

class BrowserNotification {
  static bool _permissionRequested = false;

  static void requestPermission() {
    if (_permissionRequested) return;
    _permissionRequested = true;
    if (globalContext.hasProperty('Notification'.toJS).toDart) {
      web.Notification.requestPermission();
    }
  }

  static void show({required String title, String? body, String? tag}) {
    if (!globalContext.hasProperty('Notification'.toJS).toDart) return;
    if (web.Notification.permission != 'granted') return;
    final notification = web.Notification(
      title,
      web.NotificationOptions(
        body: body ?? '',
        tag: tag ?? '',
        icon: 'favicon.png',
      ),
    );
    // Navigate to conversation when clicked
    notification.onclick = ((web.Event event) {
      if (tag != null && tag.isNotEmpty && !tag.startsWith('new-conv') && !tag.startsWith('snooze-')) {
        // tag contains conversationId — navigate to it
        web.window.location.hash = '/chat/$tag';
      }
      notification.close();
    }).toJS;
  }
}
