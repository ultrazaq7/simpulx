package com.simpulx.app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.RemoteInput

/**
 * BroadcastReceiver that handles "Reply" and "Mark as read" actions
 * from the notification directly — no need for Flutter to be running.
 */
class ReplyReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val chatId = intent.getStringExtra("chatId") ?: return
        val callId = intent.getStringExtra("callId") ?: ""

        when (intent.action) {
            ACTION_REPLY -> handleReply(context, intent, chatId)
            ACTION_MARK_AS_READ -> handleMarkAsRead(context, chatId)
            ACTION_REJECT_CALL -> handleRejectCall(context, chatId, callId)
        }
    }

    private fun handleReply(context: Context, intent: Intent, chatId: String) {
        val remoteInput = RemoteInput.getResultsFromIntent(intent)
        val replyText = remoteInput?.getCharSequence("key_text_reply")?.toString()
        if (replyText.isNullOrBlank()) return

        // Which notification carries the RemoteInput spinner: the chat thread
        // notification, or the missed-call note's Message action. The spinner
        // only stops when that SAME id is re-notified, so route accordingly.
        val fromMissed = intent.getBooleanExtra("fromMissed", false)

        NativeApiClient.sendReply(
            context = context,
            chatId = chatId,
            text = replyText,
            onSuccess = {
                Log.d("ReplyReceiver", "Background reply sent! (missed=$fromMissed)")
                if (fromMissed) {
                    NotificationHelper.finishMissedReply(context, chatId, true)
                } else {
                    // Append the message to the notification stack and stop the spinner
                    NotificationHelper.appendSentMessage(context, chatId, replyText)
                }
            },
            onError = { e ->
                Log.e("ReplyReceiver", "Failed to send background reply", e)
                if (fromMissed) {
                    NotificationHelper.finishMissedReply(context, chatId, false)
                } else {
                    NotificationHelper.appendFailedMessage(context, chatId)
                }
            }
        )
    }

    private fun handleMarkAsRead(context: Context, chatId: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(chatId.hashCode())
        android.util.Log.d("ReplyReceiver", "Mark as read: $chatId")
    }

    private fun handleRejectCall(context: Context, chatId: String, callId: String) {
        // Dismiss the call notification immediately
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(chatId.hashCode() + 100)
        Log.d("ReplyReceiver", "Rejecting call: $callId")

        // Hit the reject API in the background
        if (callId.isNotEmpty()) {
            NativeApiClient.rejectCall(context, callId) {
                Log.d("ReplyReceiver", "Call rejected via API: $callId")
            }
        }
    }

    companion object {
        const val ACTION_REPLY = "simpulx.ACTION_REPLY"
        const val ACTION_MARK_AS_READ = "simpulx.ACTION_MARK_AS_READ"
        const val ACTION_REJECT_CALL = "simpulx.ACTION_REJECT_CALL"

        fun getReplyIntent(context: Context, chatId: String): Intent {
            return Intent(context, ReplyReceiver::class.java).apply {
                action = ACTION_REPLY
                putExtra("chatId", chatId)
            }
        }

        fun getMarkAsReadIntent(context: Context, chatId: String): Intent {
            return Intent(context, ReplyReceiver::class.java).apply {
                action = ACTION_MARK_AS_READ
                putExtra("chatId", chatId)
            }
        }

        fun getRejectCallIntent(context: Context, chatId: String, callId: String): Intent {
            return Intent(context, ReplyReceiver::class.java).apply {
                action = ACTION_REJECT_CALL
                putExtra("chatId", chatId)
                putExtra("callId", callId)
            }
        }
    }
}
