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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
        }
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
                    else -> result.notImplemented()
                }
            }
    }
}
