package com.simpulx.app

import android.Manifest
import android.app.ActivityManager
import android.app.DownloadManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.annotation.RequiresApi
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.simpulx.app/call_tracker"
    private val DOWNLOAD_CHANNEL = "com.simpulx.app/downloader"
    private val PHONE_STATE_PERMISSION_CODE = 1001

    private var telephonyManager: TelephonyManager? = null
    private var callStartTime: Long = 0
    private var isCallActive = false
    private var pendingResult: MethodChannel.Result? = null

    // Legacy listener for Android < 12
    @Suppress("DEPRECATION")
    private var phoneStateListener: PhoneStateListener? = null

    // Modern callback for Android 12+
    private var telephonyCallback: Any? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // File downloader via Android DownloadManager (works on all Android versions, no permissions needed)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, DOWNLOAD_CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "downloadFile") {
                val url = call.argument<String>("url") ?: return@setMethodCallHandler result.error("INVALID", "url is null", null)
                val filename = call.argument<String>("filename") ?: "download"
                try {
                    val request = DownloadManager.Request(Uri.parse(url))
                        .setTitle(filename)
                        .setDescription("Downloading...")
                        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                        .setAllowedOverMetered(true)
                        .setAllowedOverRoaming(true)
                    val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                    dm.enqueue(request)
                    result.success(null)
                } catch (e: Exception) {
                    result.error("DOWNLOAD_ERROR", e.message, null)
                }
            } else {
                result.notImplemented()
            }
        }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "requestPermission" -> {
                    if (hasPhoneStatePermission()) {
                        result.success(true)
                    } else {
                        pendingResult = result
                        requestPhoneStatePermission()
                    }
                }
                "trackCall" -> {
                    if (hasPhoneStatePermission()) {
                        startCallTracking(result)
                    } else {
                        // No permission — return -1 immediately
                        result.success(-1)
                    }
                }
                "stopTracking" -> {
                    stopCallTracking()
                    result.success(null)
                }
                "hasPermission" -> {
                    result.success(hasPhoneStatePermission())
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun hasPhoneStatePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this, Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestPhoneStatePermission() {
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.READ_PHONE_STATE),
            PHONE_STATE_PERMISSION_CODE
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PHONE_STATE_PERMISSION_CODE) {
            val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
            pendingResult?.success(granted)
            pendingResult = null
        }
    }

    private fun startCallTracking(result: MethodChannel.Result) {
        telephonyManager = getSystemService(TELEPHONY_SERVICE) as TelephonyManager
        callStartTime = 0
        isCallActive = false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            startModernTracking(result)
        } else {
            startLegacyTracking(result)
        }
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun startModernTracking(result: MethodChannel.Result) {
        val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
            override fun onCallStateChanged(state: Int) {
                handleCallState(state, result)
            }
        }
        telephonyCallback = callback
        telephonyManager?.registerTelephonyCallback(mainExecutor, callback)
    }

    @Suppress("DEPRECATION")
    private fun startLegacyTracking(result: MethodChannel.Result) {
        phoneStateListener = object : PhoneStateListener() {
            override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                handleCallState(state, result)
            }
        }
        telephonyManager?.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE)
    }

    private fun handleCallState(state: Int, result: MethodChannel.Result) {
        when (state) {
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                // Call connected
                if (!isCallActive) {
                    isCallActive = true
                    callStartTime = System.currentTimeMillis()
                }
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                // Call ended
                if (isCallActive) {
                    isCallActive = false
                    val durationMs = System.currentTimeMillis() - callStartTime
                    val durationSeconds = (durationMs / 1000).toInt()
                    stopCallTracking()

                    // Bring Simpulx back to foreground
                    bringToForeground()

                    try {
                        result.success(durationSeconds)
                    } catch (_: Exception) {
                        // Result already sent
                    }
                }
            }
            // CALL_STATE_RINGING — ignore, waiting for connection
        }
    }

    @Suppress("DEPRECATION")
    private fun stopCallTracking() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (telephonyCallback as? TelephonyCallback)?.let {
                telephonyManager?.unregisterTelephonyCallback(it)
            }
            telephonyCallback = null
        } else {
            phoneStateListener?.let {
                telephonyManager?.listen(it, PhoneStateListener.LISTEN_NONE)
            }
            phoneStateListener = null
        }
    }

    private fun bringToForeground() {
        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        am.appTasks.firstOrNull()?.moveToFront()
    }
}
