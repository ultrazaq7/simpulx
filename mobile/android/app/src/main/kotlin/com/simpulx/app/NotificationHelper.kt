package com.simpulx.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.*
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.graphics.drawable.IconCompat

/**
 * Native Android notification builder — produces WhatsApp-style MessagingStyle
 * notifications with a merged avatar+badge icon.
 */
object NotificationHelper {

    private const val CHANNEL_ID = "incoming_message"
    private const val CHANNEL_NAME = "Incoming messages"
    private const val CALL_CHANNEL_ID = "incoming_call"
    private const val CALL_CHANNEL_NAME = "Incoming calls"

    /**
     * Merge avatar bitmap with a badge bitmap (ic_notification) at bottom-right.
     * Returns a new Bitmap with the badge composited onto the avatar.
     */
    fun mergeAvatarWithBadge(avatar: Bitmap, badge: Bitmap): Bitmap {
        val size = minOf(avatar.width, avatar.height)
        val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)

        // Draw circular avatar
        val avatarRect = Rect(0, 0, size, size)
        val avatarShader = BitmapShader(avatar, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = avatarShader
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)

        // Draw badge bottom-right
        val badgeSize = (size * 0.35f).toInt()
        val left = size - badgeSize - 4
        val top = size - badgeSize - 4

        // White border around badge
        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        borderPaint.color = Color.WHITE
        val borderCenter = left + badgeSize / 2f
        val borderCenterY = top + badgeSize / 2f
        canvas.drawCircle(borderCenter, borderCenterY, badgeSize / 2f + 3, borderPaint)

        // Badge circle background (Simpulx green)
        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        bgPaint.color = Color.parseColor("#2D8B73")
        canvas.drawCircle(borderCenter, borderCenterY, badgeSize / 2f, bgPaint)

        // Draw badge icon inside circle
        val badgeScaled = Bitmap.createScaledBitmap(badge, (badgeSize * 0.6f).toInt(), (badgeSize * 0.6f).toInt(), true)
        val badgeLeft = borderCenter - badgeScaled.width / 2f
        val badgeTop = borderCenterY - badgeScaled.height / 2f
        canvas.drawBitmap(badgeScaled, badgeLeft, badgeTop, null)
        badgeScaled.recycle()

        return output
    }

    /**
     * Generate a colored circle avatar with initial letter.
     */
    fun generateInitialAvatar(name: String, size: Int = 256): Bitmap {
        val initial = if (name.isNotBlank()) name.trim().first().uppercaseChar().toString() else "?"

        val colors = intArrayOf(
            Color.parseColor("#1B5E20"), // dark green
            Color.parseColor("#0D47A1"), // dark blue
            Color.parseColor("#4A148C"), // deep purple
            Color.parseColor("#BF360C"), // deep orange
            Color.parseColor("#006064"), // cyan dark
            Color.parseColor("#880E4F"), // pink dark
            Color.parseColor("#33691E"), // lime dark
            Color.parseColor("#1A237E"), // indigo
        )
        val bgColor = colors[Math.abs(name.hashCode()) % colors.size]

        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        // Fill background
        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        bgPaint.color = bgColor
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, bgPaint)

        // Draw initial letter
        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        textPaint.color = Color.WHITE
        textPaint.textSize = size * 0.45f
        textPaint.textAlign = Paint.Align.CENTER
        textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        val textBounds = Rect()
        textPaint.getTextBounds(initial, 0, initial.length, textBounds)
        val yOffset = textBounds.height() / 2f - textBounds.bottom
        canvas.drawText(initial, size / 2f, size / 2f + yOffset, textPaint)

        return bitmap
    }

    /**
     * Build and show a WhatsApp-style MessagingStyle notification.
     */
    fun showChatNotification(
        context: Context,
        chatId: String,
        senderName: String,
        conversationTitle: String, // "Simpulx"
        message: String,
        avatarBitmap: Bitmap,  // merged avatar with badge
    ) {
        ensureChannel(context)

        val person = Person.Builder()
            .setName(senderName)
            .setIcon(IconCompat.createWithBitmap(avatarBitmap))
            .setImportant(true)
            .build()

        val style = NotificationCompat.MessagingStyle(person)
            .setConversationTitle(conversationTitle)
            .addMessage(message, System.currentTimeMillis(), person)

        // Reply action
        val replyLabel = "Reply"
        val remoteInput = RemoteInput.Builder("key_text_reply")
            .setLabel("Type a message...")
            .build()

        val replyIntent = ReplyReceiver.getReplyIntent(context, chatId)
        val replyAction = NotificationCompat.Action.Builder(
            R.drawable.ic_notification,
            replyLabel,
            PendingIntent.getBroadcast(
                context, chatId.hashCode(),
                replyIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
        )
            .addRemoteInput(remoteInput)
            .build()

        // Mark as read action
        val markReadIntent = ReplyReceiver.getMarkAsReadIntent(context, chatId)
        val markAsReadAction = NotificationCompat.Action.Builder(
            0,
            "Mark as read",
            PendingIntent.getBroadcast(
                context, chatId.hashCode() + 1,
                markReadIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        ).build()

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setGroupSummary(false)
            .setOnlyAlertOnce(true)
            .addAction(replyAction)
            .addAction(markAsReadAction)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(chatId.hashCode(), notification)
    }

    /**
     * Build and show a call-style notification.
     */
    fun showCallNotification(
        context: Context,
        chatId: String,
        contactName: String,
        body: String,
    ) {
        ensureCallChannel(context)

        val notification = NotificationCompat.Builder(context, CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(contactName)
            .setContentText(body.ifEmpty { "Incoming voice call" })
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setFullScreenIntent(null, true)
            .setAutoCancel(false)
            .setOngoing(true)
            .addAction(
                NotificationCompat.Action.Builder(
                    0, "Decline",
                    PendingIntent.getBroadcast(
                        context, chatId.hashCode() + 10,
                        ReplyReceiver.getMarkAsReadIntent(context, chatId),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                ).build()
            )
            .addAction(
                NotificationCompat.Action.Builder(
                    0, "Answer",
                    PendingIntent.getBroadcast(
                        context, chatId.hashCode() + 11,
                        ReplyReceiver.getMarkAsReadIntent(context, chatId),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                ).build()
            )
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(chatId.hashCode() + 100, notification)
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID, CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
                )
                manager.createNotificationChannel(channel)
            }
        }
    }

    private fun ensureCallChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(CALL_CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    CALL_CHANNEL_ID, CALL_CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
                )
                manager.createNotificationChannel(channel)
            }
        }
    }
}

