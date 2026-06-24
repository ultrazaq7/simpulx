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

        when (intent.action) {
            ACTION_REPLY -> handleReply(context, intent, chatId)
            ACTION_MARK_AS_READ -> handleMarkAsRead(context, chatId)
        }
    }

    private fun handleReply(context: Context, intent: Intent, chatId: String) {
        val remoteInput = RemoteInput.getResultsFromIntent(intent)
        val replyText = remoteInput?.getCharSequence("key_text_reply")?.toString()

        if (replyText.isNullOrBlank()) return

        // Dismiss the notification after extracting the reply
        
        if (replyText != null) {
            // Hit the API natively in background
            NativeApiClient.sendReply(
                context = context,
                chatId = chatId,
                text = replyText,
                onSuccess = {
                    Log.d("ReplyReceiver", "Background reply sent!")
                    // Append the message to the notification stack and stop the spinner
                    NotificationHelper.appendSentMessage(context, chatId, replyText)
                },
                onError = { e ->
                    Log.e("ReplyReceiver", "Failed to send background reply", e)
                    // On error, cancel it or we could show an error. We'll just cancel for now.
                    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    manager.cancel(chatId.hashCode())
                }
            )
        } else {
            // No text, just cancel
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.cancel(chatId.hashCode())
        }
    }

    private fun handleMarkAsRead(context: Context, chatId: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(chatId.hashCode())
        android.util.Log.d("ReplyReceiver", "Mark as read: $chatId")
    }

    companion object {
        const val ACTION_REPLY = "simpulx.ACTION_REPLY"
        const val ACTION_MARK_AS_READ = "simpulx.ACTION_MARK_AS_READ"

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
    }
}
