package com.simpulx.app

import android.content.Context
import android.content.res.Configuration
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
 * The splash background is resolved from the launch theme against the
 * ACTIVITY's configuration, so the real fix lives in
 * [MainActivity.attachBaseContext] (via [NativeThemeStore.wrap]) - this
 * AppCompatDelegate call only covers any incidental AppCompat surfaces.
 * [MainActivity] mirrors the Flutter-side preference into [NativeThemeStore]
 * every time it changes, so the store is always a beat behind the in-app
 * setting, not the system setting.
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

    private fun mode(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_THEME_MODE, "system") ?: "system"

    fun readNightMode(context: Context): Int = when (mode(context)) {
        "light" -> AppCompatDelegate.MODE_NIGHT_NO
        "dark" -> AppCompatDelegate.MODE_NIGHT_YES
        else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
    }

    /**
     * Wraps [base] with a configuration whose night-mode bit is forced to the
     * saved preference, so resource resolution for THIS activity's window -
     * including the launch/splash theme's `-night` qualifier - follows the
     * in-app choice instead of the device's system theme. Returns [base]
     * unchanged for "system" (follow the device, the default behaviour).
     */
    fun wrap(base: Context): Context {
        val m = mode(base)
        if (m == "system") return base
        val nightBits =
            if (m == "dark") Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
        val config = Configuration(base.resources.configuration)
        config.uiMode =
            (config.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or nightBits
        return base.createConfigurationContext(config)
    }
}
