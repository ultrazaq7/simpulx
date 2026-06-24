package com.simpulx.app

import android.graphics.BitmapFactory
import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import io.flutter.plugins.firebase.messaging.FlutterFirebaseMessagingService

/**
 * Custom FCM service that intercepts data-only messages and builds
 * WhatsApp-style notifications natively — no Flutter engine needed.
 *
 * Extends [FlutterFirebaseMessagingService] so the Flutter Dart isolate
 * still receives messages for foreground state updates.
 *
 * For message-type payloads, it generates the avatar+badge bitmap and
 * shows via [NotificationHelper] BEFORE delegating to Flutter.
 */
class SimpulxMessagingService : FlutterFirebaseMessagingService() {

    companion object {
        private const val TAG = "SimpulxFCM"
    }

    override fun onMessageReceived(message: RemoteMessage) {
        Log.d(TAG, "onMessageReceived: ${message.data}")

        val data = message.data
        val type = data["type"] ?: ""
        val title = data["title"] ?: "Simpulx"
        val body = data["body"] ?: ""
        val conversationId = data["conversationId"] ?: data["conversation_id"] ?: ""

        // Detect if this is a call notification
        val isCall = type == "call" || type == "incoming_call" || type == "voice_call"
                || type == "call_ringing"
                || body.lowercase().contains("incoming call")
                || body.lowercase().contains("voice call")

        // For chat messages: build native WhatsApp-style notification
        if (!isCall && conversationId.isNotEmpty()) {
            try {
                showNativeChatNotification(conversationId, title, body)
                Log.d(TAG, "Native notification shown for: $title")
                // Return early — do NOT delegate to Flutter for notification display.
                // Flutter's onMessage will still fire for foreground state updates
                // because we call super below for foreground, but NOT for background.
                return
            } catch (e: Exception) {
                Log.e(TAG, "Native notification failed, delegating to Flutter", e)
            }
        }

        // For calls, other types, or if native failed: let Flutter handle it
        super.onMessageReceived(message)
    }

    override fun onNewToken(token: String) {
        Log.d(TAG, "New FCM token: ${token.take(20)}...")
        super.onNewToken(token)
    }

    private fun showNativeChatNotification(
        chatId: String,
        senderName: String,
        messageBody: String,
    ) {
        // Generate initial avatar
        val avatar = NotificationHelper.generateInitialAvatar(senderName)

        // Load badge icon from drawable resources
        val badge = BitmapFactory.decodeResource(resources, R.drawable.ic_notification)

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
            conversationTitle = "Simpulx",
            message = messageBody,
            avatarBitmap = mergedBitmap,
        )
    }
}
