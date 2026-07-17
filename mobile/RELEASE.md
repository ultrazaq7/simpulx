# Simpulx Mobile — Release Guide

Bundle ID (both platforms): **`com.simpulx.app`**
Display name: **Simpulx**
Version: set in `pubspec.yaml` → `version: 1.0.0+1` (`<versionName>+<versionCode>`).
Bump for every store upload, e.g. `1.0.1+2`.

Production endpoints are baked into the prod flavor (`AppConfig`):
`https://app.simpulx.com` (REST) + `wss://app.simpulx.com` (WebSocket).
Always build prod with `--dart-define=FLAVOR=prod`.

---

## Android — Google Play (.aab)

### One-time
- An **upload keystore** has already been generated at `android/upload-keystore.jks`
  with `android/key.properties` (both are **gitignored**). The release
  `signingConfig` reads them automatically.
- **Back up `upload-keystore.jks` + `key.properties` somewhere safe.** Losing the
  upload key means you must reset it via Play Console (only possible with Play
  App Signing enabled — keep it enabled).

### Build
```bash
cd mobile
flutter clean
flutter pub get
flutter build appbundle --release --flavor prod --dart-define=FLAVOR=prod
# (APK: flutter build apk --release --flavor prod --dart-define=FLAVOR=prod)
```
Output: `build/app/outputs/bundle/prodRelease/app-prod-release.aab`

NOTE: `--flavor prod` is REQUIRED. Without it Gradle builds the `dev` flavor
(applicationId `com.simpulx.app.dev`), which fails Google Services (no matching
client in google-services.json) and would point the app at the dev backend.

The release build is **signed**, **R8-minified**, and **resource-shrunk**
(keep rules in `android/app/proguard-rules.pro` cover WebRTC, Firebase, and
local notifications).

### Upload
1. Play Console → your app → Production (or Internal testing first) → Create release.
2. Keep **Play App Signing** enabled (recommended).
3. Upload `app-release.aab`, fill release notes, roll out.

### Firebase / FCM (prod)
- The bundled `android/app/google-services.json` must belong to your **prod**
  Firebase project (package `com.simpulx.app`). Swap it if you use a separate
  prod project.
- The backend must run with real FCM credentials and `FCM_MOCK` **off** to send
  real pushes.

---

## iOS — App Store (.ipa) — requires a Mac with Xcode

### One-time
- Open `ios/Runner.xcworkspace` in Xcode (not the `.xcodeproj`).
- Signing & Capabilities → select your **Team**; bundle id stays `com.simpulx.app`.
- Add capabilities: **Push Notifications** and **Background Modes** (Audio,
  AirPlay, and Picture in Picture + Voice over IP — already declared in
  `Info.plist`).
- Firebase iOS push: upload your **APNs Auth Key (.p8)** to the Firebase console
  (Project settings → Cloud Messaging). Ensure `GoogleService-Info.plist` is the
  prod project's.
- Deployment target is **iOS 14** (set in `ios/Podfile`).

### Build
```bash
cd mobile
flutter clean
flutter pub get
cd ios && pod install && cd ..
flutter build ipa --release --dart-define=FLAVOR=prod
```
Output: `build/ios/ipa/*.ipa` (or open `build/ios/archive/Runner.xcarchive` in Xcode Organizer).

### Upload
- Xcode → Window → Organizer → select the archive → **Distribute App** →
  App Store Connect, **or** use **Transporter** with the generated `.ipa`.

---

## Assets already configured
- **Launcher icons** — generated from `assets/images/simpulx_logo.png`
  (`flutter_launcher_icons`; adaptive icon background `#2D8B73`).
  Regenerate after changing the source: `dart run flutter_launcher_icons`.
- **Native splash** — generated from `assets/images/splash_logo.png` on a
  `#0B1413` background (`flutter_native_splash`).
  Regenerate: `dart run flutter_native_splash:create`.

## Store listing checklist (you provide)
- App icon 1024×1024 (Play + App Store), feature graphic (Play),
  screenshots per device class, privacy policy URL, data-safety / privacy
  nutrition labels (the app uses: camera, microphone, photos, contacts data,
  push notifications).
