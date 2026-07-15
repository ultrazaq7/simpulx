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

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Register for PushKit VoIP pushes so incoming calls wake the app (even when
    // killed) and can be reported to CallKit immediately, as iOS 13+ requires.
    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
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
