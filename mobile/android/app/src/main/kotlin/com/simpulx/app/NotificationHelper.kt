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

    // NOTE: Android notification channels are IMMUTABLE after first creation —
    // changing sound/vibration in code is ignored on devices that already created
    // the channel. So when we change channel behaviour we bump the id (…_v2) to
    // force a fresh channel. Keep CHANNEL_ID in sync with the FCM
    // `default_notification_channel_id` meta-data in AndroidManifest.xml.
    private const val CHANNEL_ID = "incoming_message_v2"
    private const val CHANNEL_NAME = "Messages"
    // v3: the channel is now SILENT — IncomingCallRinger owns the looping ringtone
    // + repeating vibration (a channel sound only fires once and can be suppressed
    // by the full-screen intent, which is why calls came in silent).
    private const val CALL_CHANNEL_ID = "incoming_call_v3"
    private const val CALL_CHANNEL_NAME = "Incoming calls"
    // Silent, low-importance channel for the persistent ACTIVE-call notification
    // (WhatsApp-style ongoing call with a Hang up chip) — no sound/vibration since
    // the call is already connected.
    private const val ONGOING_CALL_CHANNEL_ID = "ongoing_call"
    private const val ONGOING_CALL_CHANNEL_NAME = "Ongoing call"
    // Fixed id for the single active-call notification (only one call at a time).
    const val ONGOING_CALL_NOTIF_ID = 0x5CA11

    // WhatsApp-like vibration pattern reused across message + call channels so
    // every notification buzzes consistently: wait, buzz, pause, buzz.
    private val MESSAGE_VIBRATION = longArrayOf(0, 400, 200, 400)

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
        // Ring for real: looping ringtone + repeating vibration for the whole ring
        // (the channel itself is silent — see CALL_CHANNEL_ID).
        IncomingCallRinger.start(context)
    }

    /**
     * Cancel the active (ringing/ongoing) call notification for a conversation.
     * Called when the call ends, is declined, or is answered so it never lingers
     * or re-rings. Always stops the ringtone/vibration too.
     */
    fun cancelCallNotification(context: Context, chatId: String) {
        IncomingCallRinger.stop(context)
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(chatId.hashCode() + 100)
    }

    /** Cancel the lightweight "missed call" note (distinct id from the ring). */
    fun cancelMissedCallNotification(context: Context, chatId: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(chatId.hashCode() + 101)
    }

    /**
     * WhatsApp-style "missed call" note. Uses MessagingStyle (like the chat
     * notification) so the caller avatar sits on the LEFT with the app badge
     * merged into it - not a plain notification with a right-side largeIcon.
     * Silent, auto-cancel, with Call back (redial) and Message (inline reply).
     */
    fun showMissedCallNotification(
        context: Context,
        chatId: String,
        contactName: String,
    ) {
        ensureChannel(context)

        val name = if (contactName.isNotBlank()) contactName else "Missed call"

        // Plain avatar only - Android's Conversation API overlays the app's
        // small icon on the Person avatar automatically, so merging our own
        // badge produced a double icon.
        val avatar = generateInitialAvatar(name)
        val caller = Person.Builder()
            .setName(name)
            .setIcon(IconCompat.createWithBitmap(avatar))
            .setImportant(true)
            .build()
        val style = NotificationCompat.MessagingStyle(Person.Builder().setName("You").build())
            .addMessage("Missed voice call", System.currentTimeMillis(), caller)

        // Conversation shortcut: same id as the chat thread so Android renders
        // this as a Conversation notification (avatar LEFT with the app icon as
        // a small overlay badge - no separate header icon), exactly like the
        // chat + incoming-call notifications.
        val shortcutId = "chat_$chatId"
        val shortcut = ShortcutInfoCompat.Builder(context, shortcutId)
            .setLongLived(true)
            .setShortLabel(name)
            .setIcon(IconCompat.createWithBitmap(avatar))
            .setIntent(
                Intent(context, MainActivity::class.java)
                    .setAction(Intent.ACTION_VIEW)
                    .putExtra("chat_id", chatId)
            )
            .setPerson(caller)
            .setCategories(setOf("com.simpulx.app.category.SHARE_TARGET"))
            .build()
        ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)

        fun tapRoute(route: String, requestCode: Int): PendingIntent {
            val intent = Intent(context, MainActivity::class.java).apply {
                action = "com.simpulx.app.ACTION_TAP_NOTIFICATION"
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("route", route)
                putExtra("chatId", chatId)
            }
            return PendingIntent.getActivity(
                context, chatId.hashCode() + requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        // Call back -> redial (the app starts an outbound call from this route).
        val chatRoute = "/chat/$chatId"
        val callbackRoute = "/callback/$chatId?name=" + android.net.Uri.encode(name)

        // Message -> inline reply, identical to the chat notification's Reply:
        // type in the shade and it's sent in the background (works app-killed).
        // fromMissed lets ReplyReceiver clear THIS notification's spinner.
        val replyIntent = ReplyReceiver.getReplyIntent(context, chatId).apply {
            putExtra("fromMissed", true)
        }
        val messageAction = NotificationCompat.Action.Builder(
            R.drawable.ic_notification,
            "Message",
            PendingIntent.getBroadcast(
                context, chatId.hashCode() + 104,
                replyIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
        ).addRemoteInput(
            RemoteInput.Builder("key_text_reply").setLabel("Message...").build()
        ).build()

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setShortcutId(shortcutId) // conversation rendering: avatar left + tiny badge
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            // A missed call must never ring or vibrate; it's a passive note.
            .setSilent(true)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(tapRoute(chatRoute, 101))
            .addAction(0, "Call back", tapRoute(callbackRoute, 102))
            .addAction(messageAction)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(chatId.hashCode() + 101, notification)
    }

    /**
     * Resolve the missed-call note after an inline "Message" reply. An inline
     * reply's spinner only stops when the SAME notification id is re-notified -
     * cancel() alone leaves it spinning forever. Show a brief silent
     * confirmation that auto-dismisses.
     */
    fun finishMissedReply(context: Context, chatId: String, ok: Boolean) {
        ensureChannel(context)
        val n = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentText(if (ok) "Message sent" else "Failed to send message")
            .setSilent(true)
            .setAutoCancel(true)
            .setTimeoutAfter(2500)
            .build()
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(chatId.hashCode() + 101, n)
    }

    /**
     * Reminder/alert notification (follow-up, snooze, lead-ready). Rendered with
     * the SAME MessagingStyle + avatar-left + merged app badge as the chat and
     * call notifications, so every Simpulx notification looks consistent — just
     * without the Reply/Mark-read actions (it's an alert, not a message). Keeps a
     * STABLE id per (type + conversation) so duplicate pushes collapse into one.
     */
    fun showAlertNotification(
        context: Context,
        chatId: String,
        type: String,
        title: String,
        body: String,
    ) {
        ensureChannel(context)

        val name = title.ifBlank { "Simpulx" }
        val route = if (chatId.isNotEmpty()) "/chat/$chatId" else "/dashboard"

        // Same avatar-left + app-badge-overlay conversation rendering as chat.
        val avatar = generateInitialAvatar(name)
        val person = Person.Builder()
            .setName(name)
            .setIcon(IconCompat.createWithBitmap(avatar))
            .setImportant(true)
            .build()

        val shortcutId = if (chatId.isNotEmpty()) "chat_$chatId" else "alert_$type"
        val shortcut = ShortcutInfoCompat.Builder(context, shortcutId)
            .setLongLived(true)
            .setShortLabel(name)
            .setIcon(IconCompat.createWithBitmap(avatar))
            .setIntent(
                Intent(context, MainActivity::class.java)
                    .setAction(Intent.ACTION_VIEW)
                    .putExtra("chat_id", chatId)
            )
            .setPerson(person)
            .setCategories(setOf("com.simpulx.app.category.SHARE_TARGET"))
            .build()
        ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)

        val style = NotificationCompat.MessagingStyle(Person.Builder().setName("You").build())
            .addMessage(body.ifEmpty { "New update" }, System.currentTimeMillis(), person)

        val stableId = (type + ":" + chatId).hashCode()
        val tapIntent = Intent(context, MainActivity::class.java).apply {
            action = "com.simpulx.app.ACTION_TAP_NOTIFICATION"
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("route", route)
        }
        val contentIntent = PendingIntent.getActivity(
            context, stableId, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setShortcutId(shortcutId)
            .setStyle(style)
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
                ).apply {
                    // Buzz on every message like WhatsApp (explicit so it never
                    // depends on OEM defaults).
                    enableVibration(true)
                    vibrationPattern = MESSAGE_VIBRATION
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
                }
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
                    // Silent on purpose: IncomingCallRinger plays the LOOPING
                    // ringtone + vibration for the whole ring. A channel sound
                    // would only fire once and would double up with the ringer.
                    setSound(null, null)
                    enableVibration(false)
                }
                manager.createNotificationChannel(channel)
            }
        }
    }

    private fun ensureOngoingCallChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(ONGOING_CALL_CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    ONGOING_CALL_CHANNEL_ID, ONGOING_CALL_CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                    setSound(null, null)
                    enableVibration(false)
                }
                manager.createNotificationChannel(channel)
            }
        }
    }

    /**
     * WhatsApp-style ONGOING (active) call notification: a persistent bar with the
     * caller avatar and a single red "Hang up" chip, shown while an outbound or
     * connected call is live so it stays visible when the app is minimized. Built
     * here and posted by [CallForegroundService] via startForeground so the OS
     * keeps the process (and the mic/WebRTC) alive in the background.
     */
    fun buildOngoingCallNotification(
        context: Context,
        chatId: String,
        callId: String,
        contactName: String,
        statusText: String,
    ): android.app.Notification {
        ensureOngoingCallChannel(context)

        // Tap -> reopen the live call screen.
        val openIntent = Intent(context, MainActivity::class.java).apply {
            action = "com.simpulx.app.ACTION_TAP_NOTIFICATION"
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("route", "/call/$chatId?callId=$callId")
            putExtra("contactName", contactName)
            putExtra("chatId", chatId)
        }
        val openPending = PendingIntent.getActivity(
            context, chatId.hashCode() + 12, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Hang up -> broadcast to ReplyReceiver (ends the call on the backend +
        // stops the foreground service). The Dart side tears down WebRTC when the
        // realtime "ended" event lands (WS is connected during a live call).
        val hangupIntent = ReplyReceiver.getHangupCallIntent(context, chatId, callId)
        val hangupPending = PendingIntent.getBroadcast(
            context, chatId.hashCode() + 13, hangupIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val caller = Person.Builder()
            .setName(if (contactName.isNotBlank()) contactName else "Unknown")
            .setIcon(IconCompat.createWithBitmap(generateInitialAvatar(contactName)))
            .setImportant(true)
            .build()

        return NotificationCompat.Builder(context, ONGOING_CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setStyle(NotificationCompat.CallStyle.forOngoingCall(caller, hangupPending))
            .setContentText(statusText.ifEmpty { "Ongoing call" })
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openPending)
            .setOngoing(true)
            .setAutoCancel(false)
            .setColorized(true)
            .build()
    }

    /** Cancel the active-call notification (id is fixed, single call at a time). */
    fun cancelOngoingCallNotification(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(ONGOING_CALL_NOTIF_ID)
    }
}

