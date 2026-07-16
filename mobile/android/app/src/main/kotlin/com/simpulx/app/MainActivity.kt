package com.simpulx.app

import android.graphics.BitmapFactory

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.os.Bundle
import android.content.Intent
import android.content.Context
import android.app.NotificationManager
import androidx.core.app.RemoteInput
import android.content.res.Configuration
import android.content.res.Resources

class MainActivity : FlutterActivity() {

    private val CHANNEL = "simpulx_notification"

    // Outbound ringback tone (played while an outbound call is ringing). Uses the
    // system ToneGenerator so no audio asset needs to be bundled.
    private var ringbackTone: android.media.ToneGenerator? = null

    // Splash theming is handled by NativeThemeStore.applyToSystem() which
    // uses UiModeManager (API 31+). We intentionally do NOT wrap the base
    // context here so Flutter's platformBrightness stays in sync with the
    // real device theme — ThemeMode.system needs that to work correctly.
    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(newBase)
    }

    // Receives the app-internal hang-up broadcast from the ongoing-call
    // notification so Dart can tear the call overlay down immediately (see
    // ReplyReceiver.handleHangupCall) instead of waiting for the realtime
    // "ended" event to make a round trip through the backend.
    private val hangupReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            flutterEngine?.dartExecutor?.binaryMessenger?.let { messenger ->
                MethodChannel(messenger, CHANNEL).invokeMethod("onCallHangup", null)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val filter = android.content.IntentFilter(ReplyReceiver.ACTION_LOCAL_CALL_HANGUP)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(hangupReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(hangupReceiver, filter)
        }
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent) {
        if (intent.action == "com.simpulx.app.ACTION_INLINE_REPLY") {
            val chatId = intent.getStringExtra("chatId")
            
            // Extract text from RemoteInput
            val remoteInput = RemoteInput.getResultsFromIntent(intent)
            val replyText = remoteInput?.getCharSequence("key_text_reply")?.toString()
            
            if (chatId != null && replyText != null) {
                // Cancel notification to stop the spinner
                val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                manager.cancel(chatId.hashCode())

                val data = mapOf("chatId" to chatId, "replyText" to replyText)
                flutterEngine?.dartExecutor?.binaryMessenger?.let { messenger ->
                    MethodChannel(messenger, CHANNEL).invokeMethod("onInlineReply", data)
                }
            }
        } else if (intent.action == "com.simpulx.app.ACTION_TAP_NOTIFICATION") {
            val route = intent.getStringExtra("route")
            val chatId = intent.getStringExtra("chatId")
            
            // A full-screen intent PRESENTS the incoming-call UI while the call is
            // still ringing — it is NOT an answer, so the ring notification and the
            // ringtone must both stay. Only a real Answer tap clears them (and the
            // in-app Accept/Decline does it via the cancelCallNotification channel
            // method, so every path is still covered).
            val fromFullScreen = intent.getBooleanExtra("fromFullScreen", false)
            if (chatId != null && !fromFullScreen) {
                // Answering: drop the ring notification AND stop the ringtone/vibration.
                NotificationHelper.cancelCallNotification(this, chatId)
            }

            // A ringing call must appear OVER the lock screen (WhatsApp-style) —
            // without showWhenLocked/turnScreenOn the full-screen intent fires but
            // Android refuses to draw the activity above the keyguard, so nothing
            // appears until you unlock. Enabled only for call intents, never for
            // ordinary notification taps: this is a CRM, so the inbox must NOT be
            // readable off a locked phone.
            val isCallIntent = route?.startsWith("/call/") == true
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(isCallIntent)
                setTurnScreenOn(isCallIntent)
            }

            // Answering (a real tap, not the full-screen presentation) drops the
            // keyguard so the agent lands in the live call instead of the lock.
            if (isCallIntent && !fromFullScreen &&
                android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                val km = getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
                if (km.isKeyguardLocked) {
                    km.requestDismissKeyguard(this, null)
                }
            }

            if (route != null) {
                flutterEngine?.dartExecutor?.binaryMessenger?.let { messenger ->
                    MethodChannel(messenger, CHANNEL).invokeMethod("onNotificationTap", route)
                }
            }
        }
    }

    private fun stopRingbackTone() {
        ringbackTone?.let {
            try {
                it.stopTone()
                it.release()
            } catch (_: Exception) {}
        }
        ringbackTone = null
    }

    override fun onDestroy() {
        stopRingbackTone()
        try {
            unregisterReceiver(hangupReceiver)
        } catch (_: Exception) {
        }
        super.onDestroy()
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "showChatNotification" -> {
                        try {
                            val chatId = call.argument<String>("chatId") ?: ""
                            val senderName = call.argument<String>("senderName") ?: "Unknown"
                            val conversationTitle = call.argument<String>("conversationTitle") ?: "Simpulx"
                            val message = call.argument<String>("message") ?: ""
                            val avatarBytes = call.argument<ByteArray>("avatar")
                            val badgeBytes = call.argument<ByteArray>("badge")

                            // Generate initial avatar
                            val avatar = if (avatarBytes != null && avatarBytes.isNotEmpty()) {
                                BitmapFactory.decodeByteArray(avatarBytes, 0, avatarBytes.size)
                            } else {
                                NotificationHelper.generateInitialAvatar(senderName)
                            }

                            // Load badge icon
                            val badge = if (badgeBytes != null && badgeBytes.isNotEmpty()) {
                                BitmapFactory.decodeByteArray(badgeBytes, 0, badgeBytes.size)
                            } else {
                                // Load ic_notification from drawable resources
                                BitmapFactory.decodeResource(resources, R.drawable.ic_notification)
                            }

                            // Merge avatar + badge
                            val mergedBitmap = if (badge != null) {
                                NotificationHelper.mergeAvatarWithBadge(avatar, badge)
                            } else {
                                avatar
                            }

                            // Show notification
                            NotificationHelper.showChatNotification(
                                context = this,
                                chatId = chatId,
                                senderName = senderName,
                                conversationTitle = conversationTitle,
                                message = message,
                                avatarBitmap = mergedBitmap,
                            )

                            result.success(true)
                        } catch (e: Exception) {
                            result.error("NOTIFICATION_ERROR", e.message, null)
                        }
                    }
                    "cancelNotification" -> {
                        try {
                            val id = call.argument<Int>("id") ?: return@setMethodCallHandler
                            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                            manager.cancel(id)
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }
                    // Cancel the call ring/ongoing notification by conversation id. The id is
                    // derived natively (chatId.hashCode() + 100) so it MATCHES what
                    // NotificationHelper.showCallNotification used. Passing a Dart-computed id
                    // never matched (Dart and JVM String.hashCode differ), so the ring lingered.
                    "cancelCallNotification" -> {
                        try {
                            val chatId = call.argument<String>("chatId") ?: ""
                            NotificationHelper.cancelCallNotification(this, chatId)
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }
                    // Flutter mirrors the JWT here so the background reply/reject
                    // path can authenticate without reading flutter_secure_storage.
                    "saveNativeAuth" -> {
                        try {
                            val access = call.argument<String>("access") ?: ""
                            val refresh = call.argument<String>("refresh")
                            NativeApiClient.storeTokens(this, access, refresh)
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }
                    "clearNativeAuth" -> {
                        try {
                            NativeApiClient.clearTokens(this)
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }
                    // Start the outbound ringback tone (repeats until stopped).
                    "startRingback" -> {
                        try {
                            if (ringbackTone == null) {
                                ringbackTone = android.media.ToneGenerator(
                                    android.media.AudioManager.STREAM_VOICE_CALL, 80
                                )
                            }
                            ringbackTone?.startTone(
                                android.media.ToneGenerator.TONE_SUP_RINGTONE
                            )
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }
                    "stopRingback" -> {
                        try {
                            stopRingbackTone()
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }
                    // Start/refresh the foreground service + WhatsApp-style ongoing
                    // call notification (keeps an active call alive when minimized).
                    "startOngoingCall" -> {
                        try {
                            CallForegroundService.start(
                                context = this,
                                chatId = call.argument<String>("chatId") ?: "",
                                callId = call.argument<String>("callId") ?: "",
                                contactName = call.argument<String>("contactName") ?: "",
                                statusText = call.argument<String>("statusText") ?: "Ongoing call",
                            )
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }
                    "stopOngoingCall" -> {
                        try {
                            CallForegroundService.stop(this)
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }
                    // Android 14 (API 34) stopped auto-granting USE_FULL_SCREEN_INTENT
                    // to apps that aren't dialers/alarms — declaring it in the
                    // manifest is no longer enough. Without it an incoming call can
                    // only render as a heads-up notification, never the WhatsApp-style
                    // full-screen ringing UI, so we have to ask the user for it.
                    "canUseFullScreenIntent" -> {
                        try {
                            if (android.os.Build.VERSION.SDK_INT >= 34) {
                                val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                                result.success(nm.canUseFullScreenIntent())
                            } else {
                                result.success(true) // auto-granted below API 34
                            }
                        } catch (e: Exception) {
                            result.success(true) // never block the caller on this
                        }
                    }
                    "requestFullScreenIntentPermission" -> {
                        try {
                            if (android.os.Build.VERSION.SDK_INT >= 34) {
                                startActivity(
                                    Intent(
                                        android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                                        android.net.Uri.parse("package:$packageName")
                                    )
                                )
                            }
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }
                    // Mirror the user's in-app theme choice (light/dark/system) and
                    // push it into the SYSTEM via UiModeManager (API 31+), so the
                    // system-drawn splash of the next cold start follows the manual
                    // choice instead of the device theme.
                    "setThemeMode" -> {
                        try {
                            val mode = call.argument<String>("mode") ?: "system"
                            NativeThemeStore.save(this, mode)
                            NativeThemeStore.applyToSystem(this)
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }
                    // Returns the REAL device brightness ("light" or "dark"),
                    // bypassing any configuration override from attachBaseContext.
                    // Used by Dart to resolve ThemeMode.system correctly at runtime.
                    "getSystemBrightness" -> {
                        val sysNight = Resources.getSystem().configuration.uiMode and
                                       Configuration.UI_MODE_NIGHT_MASK
                        result.success(
                            if (sysNight == Configuration.UI_MODE_NIGHT_YES) "dark" else "light"
                        )
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
