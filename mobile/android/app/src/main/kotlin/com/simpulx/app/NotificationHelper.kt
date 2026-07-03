package com.simpulx.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.*
import android.os.Build
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
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
        conversationTitle: String,
        message: String,
        avatarBitmap: Bitmap,
        messageIntent: Intent? = null,
    ) {
        ensureChannel(context)

        // Reply action with RemoteInput
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

        // --- Conversation Notification API (like WhatsApp) ---
        // Create Person objects
        val selfPerson = Person.Builder().setName("You").build()
        val senderPerson = Person.Builder()
            .setName(senderName)
            .setIcon(IconCompat.createWithBitmap(avatarBitmap))
            .setImportant(true)
            .build()

        // 1. Push a dynamic shortcut for this conversation
        //    This is what makes Android render it as a "Conversation" notification
        //    with avatar on LEFT and small icon as badge overlay (like WhatsApp)
        val shortcutId = "chat_$chatId"
        val shortcut = ShortcutInfoCompat.Builder(context, shortcutId)
            .setLongLived(true)
            .setShortLabel(senderName)
            .setIcon(IconCompat.createWithBitmap(avatarBitmap))
            .setIntent(
                Intent(context, MainActivity::class.java)
                    .setAction(Intent.ACTION_VIEW)
                    .putExtra("chat_id", chatId)
            )
            .setPerson(senderPerson)
            .setCategories(setOf("com.simpulx.app.category.SHARE_TARGET"))
            .build()
        ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)

        // 2. Extract existing MessagingStyle (if any) to stack multiple messages like WhatsApp
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        var style: NotificationCompat.MessagingStyle? = null

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val activeNotifications: Array<StatusBarNotification> = manager.activeNotifications
            for (statusBarNotification in activeNotifications) {
                if (statusBarNotification.id == chatId.hashCode()) {
                    style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(statusBarNotification.notification)
                    break
                }
            }
        }

        if (style == null) {
            style = NotificationCompat.MessagingStyle(selfPerson)
        }
        
        style.addMessage(message, System.currentTimeMillis(), senderPerson)

        // Create Content Intent for routing on tap
        val tapIntent = Intent(context, MainActivity::class.java).apply {
            action = "com.simpulx.app.ACTION_TAP_NOTIFICATION"
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("route", "/chat/$chatId")
        }
        val contentIntent = PendingIntent.getActivity(
            context,
            chatId.hashCode(),
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // 3. Build notification linked to the shortcut
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setShortcutId(shortcutId)    // Links to conversation shortcut → avatar on LEFT
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentIntent) // Opens app on tap
            .addAction(replyAction)
            .addAction(markAsReadAction)
            .build()

        manager.notify(chatId.hashCode(), notification)
    }

    /**
     * Appends a sent message (from the user) to the existing notification stack,
     * which clears the RemoteInput spinner and updates the notification visually.
     */
    fun appendSentMessage(context: Context, chatId: String, messageText: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        var style: NotificationCompat.MessagingStyle? = null
        var builder: NotificationCompat.Builder? = null

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            for (statusBarNotification in manager.activeNotifications) {
                if (statusBarNotification.id == chatId.hashCode()) {
                    val activeNotification = statusBarNotification.notification
                    style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(activeNotification)
                    builder = NotificationCompat.Builder(context, activeNotification)
                    break
                }
            }
        }

        if (style != null && builder != null) {
            val selfPerson = Person.Builder().setName("You").build()
            style.addMessage(messageText, System.currentTimeMillis(), selfPerson)
            builder.setStyle(style)
            
            // Re-notify to update UI and stop spinner
            manager.notify(chatId.hashCode(), builder.build())
        }
    }

    /**
     * Rebuilds the notification with a failure message to ensure the spinner stops.
     */
    fun appendFailedMessage(context: Context, chatId: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        var builder: NotificationCompat.Builder? = null
        var style: NotificationCompat.MessagingStyle? = null

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            for (statusBarNotification in manager.activeNotifications) {
                if (statusBarNotification.id == chatId.hashCode()) {
                    val activeNotification = statusBarNotification.notification
                    style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(activeNotification)
                    builder = NotificationCompat.Builder(context, activeNotification)
                    break
                }
            }
        }

        if (style != null && builder != null) {
            val selfPerson = Person.Builder().setName("System").build()
            style.addMessage("❌ Failed to send reply", System.currentTimeMillis(), selfPerson)
            builder.setStyle(style)
            
            // Re-notify to update UI and stop spinner
            manager.notify(chatId.hashCode(), builder.build())
        } else {
            // Fallback: just cancel it
            manager.cancel(chatId.hashCode())
        }
    }

    /**
     * Build and show a call-style notification.
     */
    fun showCallNotification(
        context: Context,
        chatId: String,
        callId: String,
        contactName: String,
        body: String,
        intent: Intent,
    ) {
        ensureCallChannel(context)

        // Answer: open the app at /call/$chatId
        val answerIntent = Intent(context, MainActivity::class.java).apply {
            action = "com.simpulx.app.ACTION_TAP_NOTIFICATION"
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("route", "/call/$chatId?callId=$callId")
            putExtra("contactName", contactName)
            putExtra("chatId", chatId)
        }
        val answerPendingIntent = PendingIntent.getActivity(
            context,
            chatId.hashCode() + 11,
            answerIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Decline: broadcast to ReplyReceiver which calls the reject API
        val declineIntent = ReplyReceiver.getRejectCallIntent(context, chatId, callId)
        val declinePendingIntent = PendingIntent.getBroadcast(
            context,
            chatId.hashCode() + 10,
            declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Caller identity for the rich CallStyle: name + circular avatar.
        val caller = Person.Builder()
            .setName(if (contactName.isNotBlank()) contactName else "Unknown")
            .setIcon(IconCompat.createWithBitmap(generateInitialAvatar(contactName)))
            .setImportant(true)
            .build()

        val notification = NotificationCompat.Builder(context, CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            // Official Android incoming-call layout: full-width row with a green
            // Answer and a red Decline button + the caller avatar. Renders in
            // full on the lock screen and as a heads-up banner (not a plain
            // "contents hidden" placeholder).
            .setStyle(
                NotificationCompat.CallStyle.forIncomingCall(
                    caller, declinePendingIntent, answerPendingIntent
                )
            )
            .setContentText(body.ifEmpty { "Incoming voice call" })
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(answerPendingIntent)
            .setFullScreenIntent(answerPendingIntent, true)
            .setAutoCancel(false)
            .setOngoing(true)
            .setColorized(true)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(chatId.hashCode() + 100, notification)
    }

    /**
     * Cancel the active (ringing/ongoing) call notification for a conversation.
     * Called when the call ends, is declined, or is answered so it never lingers
     * or re-rings.
     */
    fun cancelCallNotification(context: Context, chatId: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(chatId.hashCode() + 100)
    }

    /**
     * Show a lightweight "missed call" notification: no ringtone, no full-screen
     * intent, auto-cancel. Tapping opens the conversation. Uses a distinct id so it
     * never collides with (or revives) the ring notification.
     */
    fun showMissedCallNotification(
        context: Context,
        chatId: String,
        title: String,
        body: String,
    ) {
        ensureChannel(context)

        val tapIntent = Intent(context, MainActivity::class.java).apply {
            action = "com.simpulx.app.ACTION_TAP_NOTIFICATION"
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("route", "/chat/$chatId")
        }
        val contentIntent = PendingIntent.getActivity(
            context,
            chatId.hashCode() + 101,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title.ifEmpty { "Missed call" })
            .setContentText(body.ifEmpty { "Tap to call back" })
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentIntent)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(chatId.hashCode() + 101, notification)
    }

    /**
     * Plain reminder/alert notification (follow-up, snooze, bell). Uses a STABLE
     * id per (type + conversation) so repeated/duplicate pushes collapse into one
     * instead of stacking, and tapping opens the conversation (or dashboard).
     */
    fun showAlertNotification(
        context: Context,
        chatId: String,
        type: String,
        title: String,
        body: String,
    ) {
        ensureChannel(context)

        val route = if (chatId.isNotEmpty()) "/chat/$chatId" else "/dashboard"
        val tapIntent = Intent(context, MainActivity::class.java).apply {
            action = "com.simpulx.app.ACTION_TAP_NOTIFICATION"
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("route", route)
        }
        val stableId = (type + ":" + chatId).hashCode()
        val contentIntent = PendingIntent.getActivity(
            context, stableId, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title.ifEmpty { "Simpulx" })
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentIntent)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(stableId, notification)
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
                ).apply {
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                    setSound(
                        android.provider.Settings.System.DEFAULT_RINGTONE_URI,
                        android.media.AudioAttributes.Builder()
                            .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    vibrationPattern = longArrayOf(0, 1000, 500, 1000, 500, 1000)
                    enableVibration(true)
                }
                manager.createNotificationChannel(channel)
            }
        }
    }
}

