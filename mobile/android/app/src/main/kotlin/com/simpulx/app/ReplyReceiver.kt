package com.simpulx.app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
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
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(chatId.hashCode())

        // The actual sending will be handled by the Flutter side via MethodChannel
        // when the app is running. For background, we store the pending reply
        // and let the FCM handler pick it up.
        android.util.Log.d("ReplyReceiver", "Reply to $chatId: $replyText")

        // Wake up MainActivity to handle the reply
        val replyIntent = Intent(context, MainActivity::class.java).apply {
            action = "com.simpulx.app.ACTION_INLINE_REPLY"
            putExtra("chatId", chatId)
            putExtra("replyText", replyText)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        context.startActivity(replyIntent)
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
