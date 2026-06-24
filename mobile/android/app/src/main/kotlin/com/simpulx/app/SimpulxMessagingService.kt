package com.simpulx.app

import android.content.Context
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
 */
class SimpulxMessagingService : FlutterFirebaseMessagingService() {

    companion object {
        private const val TAG = "SimpulxFCM"
    }

    override fun onMessageReceived(message: RemoteMessage) {
        Log.d(TAG, "onMessageReceived: ${message.data}")

        val data: Map<String, String> = message.data
        val type: String = data["type"] ?: ""
        val title: String = data["title"] ?: "Simpulx"
        val body: String = data["body"] ?: ""
        val conversationId: String = data["conversationId"]
            ?: data["conversation_id"]
            ?: ""

        // Detect if this is a call notification
        val bodyLower: String = body.lowercase()
        val isCall: Boolean = type == "call" || type == "incoming_call"
                || type == "voice_call" || type == "call_ringing"
                || bodyLower.contains("incoming call")
                || bodyLower.contains("voice call")

        // For chat messages: build native WhatsApp-style notification
        if (!isCall && conversationId.isNotEmpty()) {
            try {
                showNativeChatNotification(
                    this as Context,
                    conversationId,
                    title,
                    body
                )
                Log.d(TAG, "Native notification shown for: $title")
                // Return early — native notification is displayed.
                // Do NOT call super to avoid duplicate Flutter notification.
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
        ctx: Context,
        chatId: String,
        senderName: String,
        messageBody: String,
    ) {
        // Generate initial avatar
        val avatar = NotificationHelper.generateInitialAvatar(senderName)

        // Load badge icon from drawable resources
        val badge = BitmapFactory.decodeResource(ctx.resources, R.drawable.ic_notification)

        // Merge avatar + badge
        val mergedBitmap = if (badge != null) {
            NotificationHelper.mergeAvatarWithBadge(avatar, badge)
        } else {
            avatar
        }

        // Show notification
        NotificationHelper.showChatNotification(
            context = ctx,
            chatId = chatId,
            senderName = senderName,
            conversationTitle = "Simpulx",
            message = messageBody,
            avatarBitmap = mergedBitmap,
        )
    }
}
