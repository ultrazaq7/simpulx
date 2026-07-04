package com.simpulx.app

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import androidx.appcompat.app.AppCompatDelegate
import io.flutter.app.FlutterApplication

/**
 * Applies the user's in-app theme choice (light/dark/system) to the process
 * BEFORE any Activity - including the native splash - is created.
 *
 * The Android 12+ splash is rendered by the SYSTEM (SystemUI) before this
 * process even starts, so nothing done in-process (AppCompatDelegate, a
 * configuration override) can affect it. The one mechanism that can is
 * [UiModeManager.setApplicationNightMode] (API 31+): it persists the app's
 * night-mode preference INTO the system, which then resolves the launch
 * theme's `-night` resources against that preference when drawing the splash
 * of every subsequent launch. [NativeThemeStore.applyToSystem] pushes the
 * mirrored Flutter preference through that API; MainActivity re-pushes it on
 * every in-app change.
 *
 * Pre-31 the starting window is also system-drawn but has no such API; there
 * the splash keeps following the device theme (accepted limitation), while
 * [MainActivity.attachBaseContext] (via [NativeThemeStore.wrap]) still fixes
 * the in-process window background between splash and first Flutter frame.
 */
class SimpulxApplication : FlutterApplication() {
    override fun onCreate() {
        AppCompatDelegate.setDefaultNightMode(NativeThemeStore.readNightMode(this))
        // Re-assert the persisted per-app night mode on every launch (cheap,
        // idempotent, and migrates installs that saved a preference before
        // this call existed).
        NativeThemeStore.applyToSystem(this)
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
     * Persists the preference into the SYSTEM (API 31+) so the system-drawn
     * splash screen of the next launches follows the in-app choice instead of
     * the device theme. MODE_NIGHT_AUTO maps to UI_MODE_NIGHT_UNDEFINED in the
     * platform, i.e. it clears the per-app override back to follow-system.
     */
    fun applyToSystem(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        try {
            val um = context.getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
            um.setApplicationNightMode(
                when (mode(context)) {
                    "light" -> UiModeManager.MODE_NIGHT_NO
                    "dark" -> UiModeManager.MODE_NIGHT_YES
                    else -> UiModeManager.MODE_NIGHT_AUTO
                }
            )
        } catch (_: Exception) {
            // Some OEM builds throw on this API; the splash then just keeps
            // following the device theme - never crash the app over it.
        }
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
