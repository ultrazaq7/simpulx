package com.simpulx.app

import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import io.flutter.plugins.firebase.messaging.FlutterFirebaseMessagingService

/**
 * Custom FCM service — intercepts ALL data-only messages and builds
 * notifications natively. No Flutter needed for notification display.
 *
 * Extends [FlutterFirebaseMessagingService] so Flutter still gets
 * onMessage/onMessageOpenedApp events for navigation and state updates.
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

        // Detect call notification
        val bodyLower: String = body.lowercase()
        val isCall: Boolean = type == "call" || type == "incoming_call"
                || type == "voice_call" || type == "call_ringing"
                || bodyLower.contains("incoming call")
                || bodyLower.contains("voice call")
                || bodyLower.contains("panggilan masuk")

        try {
            if (isCall) {
                showNativeCallNotification(this, conversationId, title, body, message.toIntent())
            } else {
                showNativeChatNotification(this, conversationId, title, body, message.toIntent())
            }
            Log.d(TAG, "Native notification shown: type=$type title=$title")
        } catch (e: Exception) {
            Log.e(TAG, "Native notification failed", e)
        }

        // Do NOT call super — prevents Flutter from showing duplicate notification.
        // Flutter's onMessageOpenedApp still works for tap routing.
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
        messageIntent: Intent,
    ) {
        // Plain avatar only — Android Conversation API adds small icon as badge overlay automatically
        val avatar = NotificationHelper.generateInitialAvatar(senderName)

        NotificationHelper.showChatNotification(
            context = ctx,
            chatId = chatId,
            senderName = senderName,
            conversationTitle = "Simpulx",
            message = messageBody,
            avatarBitmap = avatar,
            messageIntent = messageIntent,
        )
    }

    private fun showNativeCallNotification(
        ctx: Context,
        chatId: String,
        contactName: String,
        body: String,
        intent: Intent,
    ) {
        NotificationHelper.showCallNotification(
            context = ctx,
            chatId = chatId,
            contactName = contactName,
            body = body,
            intent = intent,
        )
    }
}
