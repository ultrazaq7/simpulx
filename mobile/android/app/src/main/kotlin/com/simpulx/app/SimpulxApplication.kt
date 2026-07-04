package com.simpulx.app

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import io.flutter.app.FlutterApplication

/**
 * Applies the user's in-app theme choice (light/dark/system) to the process
 * BEFORE any Activity - including the native splash - is created. Without
 * this, the native splash screen always follows the OS system theme via the
 * `-night` resource qualifier, even when the user manually picked a different
 * theme inside the app (Flutter's ThemeMode is Dart-side state that doesn't
 * exist yet at splash time).
 *
 * [MainActivity] mirrors the Flutter-side preference here (see
 * NativeThemeStore) every time the user changes it, so this file is always
 * a beat behind the in-app setting, not the system setting.
 */
class SimpulxApplication : FlutterApplication() {
    override fun onCreate() {
        AppCompatDelegate.setDefaultNightMode(NativeThemeStore.readNightMode(this))
        super.onCreate()
    }
}

/** Small native-owned store for the mirrored theme preference. */
object NativeThemeStore {
    private const val PREFS = "simpulx_native_prefs"
    private const val KEY_THEME_MODE = "theme_mode" // "light" | "dark" | "system"

    fun save(context: Context, mode: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_THEME_MODE, mode)
            .apply()
    }

    fun readNightMode(context: Context): Int {
        val mode = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_THEME_MODE, "system")
        return when (mode) {
            "light" -> AppCompatDelegate.MODE_NIGHT_NO
            "dark" -> AppCompatDelegate.MODE_NIGHT_YES
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        }
    }
}
