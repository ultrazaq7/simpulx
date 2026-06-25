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
        val callId: String = data["callId"] ?: data["call_id"] ?: ""
        val callStatus: String = data["callStatus"] ?: data["call_status"] ?: ""

        // Classify the push. A call is authoritatively identified by type/callStatus
        // (body string-matching was unreliable and caused "ended" pushes to ring).
        val bodyLower: String = body.lowercase()
        val isEndedCall: Boolean = type == "call_ended" || callStatus == "ended"
        val isIncomingCall: Boolean = type == "incoming_call" || type == "incomingCall"
                || type == "call" || type == "voice_call" || type == "call_ringing"
                || callStatus == "incoming"
        val isCall: Boolean = isIncomingCall || isEndedCall ||
                (callStatus.isEmpty() && type.isEmpty() &&
                        (bodyLower.contains("incoming call")
                                || bodyLower.contains("voice call")
                                || bodyLower.contains("panggilan masuk")))

        try {
            when {
                isEndedCall -> {
                    // The call is over (hangup / decline / missed). Dismiss the ring;
                    // never show a fresh call notification here.
                    NotificationHelper.cancelCallNotification(this, conversationId)
                    if (data["missed"] == "true") {
                        NotificationHelper.showMissedCallNotification(this, conversationId, title, body)
                    }
                    Log.d(TAG, "Call ended push: dismissed ring (missed=${data["missed"]})")
                }
                isCall -> {
                    showNativeCallNotification(this, conversationId, callId, title, body, message.toIntent())
                    Log.d(TAG, "Native call notification shown: title=$title")
                }
                else -> {
                    showNativeChatNotification(this, conversationId, title, body, message.toIntent())
                    Log.d(TAG, "Native chat notification shown: title=$title")
                }
            }
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
        callId: String,
        contactName: String,
        body: String,
        intent: Intent,
    ) {
        NotificationHelper.showCallNotification(
            context = ctx,
            chatId = chatId,
            callId = callId,
            contactName = contactName,
            body = body,
            intent = intent,
        )
    }
}
