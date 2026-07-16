import Flutter
import UIKit
import PushKit
import CallKit
import flutter_callkit_incoming

// NOTE: the `flutter_callkit_incoming` symbols below resolve only AFTER
// `cd ios && pod install`. Class/initializer names track the installed plugin
// version (2.x) — if the build complains, check the plugin's iOS README for the
// exact `SwiftFlutterCallkitIncomingPlugin` / `Data` API of your version.
@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate, PKPushRegistryDelegate {

  // MUST be a stored property. As a local, the registry was deallocated the moment
  // didFinishLaunching returned — taking its delegate with it — so iOS never
  // handed us a VoIP token and no call push could ever arrive (the backend had
  // nothing to send to: zero ios_voip tokens ever registered).
  private var voipRegistry: PKPushRegistry?

  // Used to hand a notification reply back to Dart (see userNotificationCenter).
  private var notificationMessenger: FlutterBinaryMessenger?

  // Replies typed into a notification while the app was killed arrive BEFORE the
  // Flutter engine exists (and before Dart installs its channel handler), so
  // firing them at Dart immediately dropped them silently — the reply just never
  // sent. Buffer instead and let Dart PULL them once it's up and authenticated;
  // consuming clears the buffer, so a reply can never send twice.
  private var pendingReplies: [[String: String]] = []

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Register for PushKit VoIP pushes so incoming calls wake the app (even when
    // killed) and can be reported to CallKit immediately, as iOS 13+ requires.
    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    voipRegistry = registry
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    notificationMessenger = engineBridge.pluginRegistry
      .registrar(forPlugin: "SimpulxNotificationReply")?
      .messenger()

    // The server sends the badge with each push, but only a push can change it —
    // so reading a chat in-app would leave a stale number on the icon. Let Dart
    // set it directly whenever the unread count changes.
    if let messenger = notificationMessenger {
      FlutterMethodChannel(name: "simpulx_notification", binaryMessenger: messenger)
        .setMethodCallHandler { [weak self] call, result in
          switch call.method {
          case "setBadge":
            let count = (call.arguments as? [String: Any])?["count"] as? Int ?? 0
            if #available(iOS 16.0, *) {
              UNUserNotificationCenter.current().setBadgeCount(count)
            } else {
              UIApplication.shared.applicationIconBadgeNumber = count
            }
            result(true)
          case "consumePendingReplies":
            // Atomically hand over and clear: Dart is up and authenticated now,
            // so it can actually send these.
            let out = self?.pendingReplies ?? []
            self?.pendingReplies = []
            result(out)
          default:
            result(FlutterMethodNotImplemented)
          }
        }
    }
  }

  // MARK: - Notification reply (iOS)

  // The notification itself is rendered by iOS from the aps alert, NOT by
  // flutter_local_notifications — and firebase_messaging owns the
  // UNUserNotificationCenter delegate — so the plugin's Dart response callback
  // never fired and typed replies were silently dropped. Handle the text response
  // here and forward it to the SAME `onInlineReply` channel Android already uses.
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    if let textResponse = response as? UNTextInputNotificationResponse {
      let userInfo = response.notification.request.content.userInfo
      let chatId = (userInfo["conversationId"] as? String)
        ?? (userInfo["conversation_id"] as? String) ?? ""
      let text = textResponse.userText
      if !chatId.isEmpty, !text.isEmpty {
        // Always buffer. Firing straight at Dart lost the reply whenever this ran
        // before the engine/handler existed — which is exactly the killed-app case
        // where replying from a notification matters most. Dart drains this on
        // startup AND on this ping, and draining clears it, so no double-send.
        pendingReplies.append(["chatId": chatId, "replyText": text])
        if let messenger = notificationMessenger {
          FlutterMethodChannel(name: "simpulx_notification", binaryMessenger: messenger)
            .invokeMethod("onPendingReplies", arguments: nil)
        }
      }
      completionHandler()
      return
    }
    super.userNotificationCenter(center, didReceive: response, withCompletionHandler: completionHandler)
  }

  // MARK: - PushKit VoIP

  // The device's VoIP token — handed to the plugin, which emits it to Dart
  // (Event.actionDidUpdateDevicePushTokenVoip) so we register it with the server.
  func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP(token)
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP("")
  }

  // A VoIP push arrived. For "incoming" we MUST report a CallKit call before the
  // completion handler runs (iOS kills the app otherwise). For "ended" we end the
  // matching CallKit call instead of ringing.
  func pushRegistry(_ registry: PKPushRegistry,
                    didReceiveIncomingPushWith payload: PKPushPayload,
                    for type: PKPushType,
                    completion: @escaping () -> Void) {
    let dict = payload.dictionaryPayload
    let event = dict["event"] as? String ?? "incoming"
    let callId = dict["callId"] as? String ?? (dict["id"] as? String ?? "")
    // CallKit needs a UUID; the backend call id is expected to be one. Fall back
    // to a fresh UUID so a malformed id still produces a valid report.
    let uuid = UUID(uuidString: callId) ?? UUID()

    if event == "ended" {
      // endCall takes a Data object (not an id string) in this plugin version.
      let endData = flutter_callkit_incoming.Data(id: uuid.uuidString, nameCaller: "", handle: "", type: 0)
      SwiftFlutterCallkitIncomingPlugin.sharedInstance?.endCall(endData)
      completion()
      return
    }

    let nameCaller = dict["nameCaller"] as? String ?? "Unknown"
    let handle = dict["handle"] as? String ?? ""
    let conversationId = dict["conversationId"] as? String ?? ""

    let data = flutter_callkit_incoming.Data(
      id: uuid.uuidString,
      nameCaller: nameCaller,
      handle: handle,
      type: 0 // 0 = audio, 1 = video
    )
    data.appName = "Simpulx"
    // Carried straight through to Dart's CallKit accept handler.
    data.extra = [
      "conversationId": conversationId,
      "callId": callId,
      "handle": handle,
    ]
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.showCallkitIncoming(data, fromPushKit: true)
    completion()
  }
}
