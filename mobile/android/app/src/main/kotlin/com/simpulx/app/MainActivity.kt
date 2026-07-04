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

class MainActivity : FlutterActivity() {

    private val CHANNEL = "simpulx_notification"

    // Outbound ringback tone (played while an outbound call is ringing). Uses the
    // system ToneGenerator so no audio asset needs to be bundled.
    private var ringbackTone: android.media.ToneGenerator? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockscreen()
        handleIntent(intent)
    }

    // Let an incoming-call full-screen intent take over a locked screen: show the
    // activity above the keyguard and turn the screen on. The manifest flags cover
    // the static case; these runtime calls make it reliable across OEM skins.
    private fun showOverLockscreen() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
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
            
            if (chatId != null) {
                // Cancel ongoing call notification if user tapped Answer
                val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                manager.cancel(chatId.hashCode() + 100)
            }

            // Answering from the lock screen must drop the keyguard so the agent
            // lands in the live call, not stuck behind the lock.
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
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
                    // Mirror the user's in-app theme choice (light/dark/system) so the
                    // NEXT cold start's splash/launch theme resolves against it via
                    // AppCompatDelegate in SimpulxApplication, instead of always
                    // following the OS system theme.
                    "setThemeMode" -> {
                        try {
                            val mode = call.argument<String>("mode") ?: "system"
                            NativeThemeStore.save(this, mode)
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
