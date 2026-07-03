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

        // Call ids we've already seen an "ended" push for. Guards against FCM
        // ordering races where a delayed "incoming" push lands AFTER the call was
        // ended/declined and would otherwise re-ring a dead call.
        private val endedCallIds =
            java.util.Collections.synchronizedSet(HashSet<String>())

        private fun markCallEnded(callId: String) {
            if (callId.isEmpty()) return
            synchronized(endedCallIds) {
                if (endedCallIds.size > 200) endedCallIds.clear()
                endedCallIds.add(callId)
            }
        }
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
        val contactName: String = data["contactName"] ?: data["contact_name"] ?: ""

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

        // Reminders/alerts (follow-up, snooze, bell notifications) are NOT chat
        // messages: render them as a plain, collapsible notification so they don't
        // stack into the conversation thread (with Reply/Mark-read) or duplicate.
        val isAlert: Boolean = type == "follow_up" || type == "follow_up_reminder"
                || type == "snooze_due" || type == "snooze_reminder"
                || type == "notification" || type == "alert"

        try {
            when {
                isEndedCall -> {
                    // The call is over (hangup / decline / missed). Remember it so a
                    // late incoming push can't re-ring it, dismiss the ring, and clear
                    // any stale missed note. Only surface a fresh "missed call" note
                    // when the call was genuinely unanswered (missed == true).
                    markCallEnded(callId)
                    NotificationHelper.cancelCallNotification(this, conversationId)
                    NotificationHelper.cancelMissedCallNotification(this, conversationId)
                    if (data["missed"] == "true") {
                        NotificationHelper.showMissedCallNotification(this, conversationId, contactName)
                    }
                    Log.d(TAG, "Call ended push: dismissed ring (missed=${data["missed"]})")
                }
                isCall -> {
                    // Drop a delayed/duplicate ring for a call that already ended so
                    // declining/ending never re-opens the call notification.
                    if (callId.isNotEmpty() && endedCallIds.contains(callId)) {
                        NotificationHelper.cancelCallNotification(this, conversationId)
                        Log.d(TAG, "Dropped ring for already-ended call: $callId")
                    } else {
                        // Clear a leftover missed note before a fresh ring so they
                        // never stack.
                        NotificationHelper.cancelMissedCallNotification(this, conversationId)
                        showNativeCallNotification(this, conversationId, callId, title, body, message.toIntent())
                        Log.d(TAG, "Native call notification shown: title=$title")
                    }
                }
                isAlert -> {
                    NotificationHelper.showAlertNotification(this, conversationId, type, title, body)
                    Log.d(TAG, "Native alert notification shown: type=$type title=$title")
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
