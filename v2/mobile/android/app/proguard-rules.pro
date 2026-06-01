# Flutter
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Keep notification classes
-keep class com.simpulx.app.** { *; }

# Suppress missing Play Core classes (used by Flutter deferred components)
-dontwarn com.google.android.play.core.**
