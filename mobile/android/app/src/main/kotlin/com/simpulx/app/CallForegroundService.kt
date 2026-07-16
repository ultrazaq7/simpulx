package com.simpulx.app

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Foreground service that keeps an ACTIVE 1:1 call alive when the app is
 * minimized (so Android doesn't suspend the process / WebRTC mic) and shows the
 * WhatsApp-style ongoing-call notification with a Hang up chip.
 *
 * Started/stopped from Dart via the `simpulx_notification` MethodChannel
 * (startOngoingCall / stopOngoingCall) as the call goes live / ends. Type is
 * MICROPHONE because the call streams the mic; RECORD_AUDIO is already granted
 * before a call starts.
 */
class CallForegroundService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelfCompat()
            return START_NOT_STICKY
        }

        val chatId = intent?.getStringExtra("chatId") ?: ""
        val callId = intent?.getStringExtra("callId") ?: ""
        val contactName = intent?.getStringExtra("contactName") ?: ""
        val statusText = intent?.getStringExtra("statusText") ?: "Ongoing call"

        val notification = NotificationHelper.buildOngoingCallNotification(
            this, chatId, callId, contactName, statusText
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NotificationHelper.ONGOING_CALL_NOTIF_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(NotificationHelper.ONGOING_CALL_NOTIF_ID, notification)
        }
        return START_NOT_STICKY
    }

    private fun stopSelfCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        NotificationHelper.cancelOngoingCallNotification(this)
        stopSelf()
    }

    companion object {
        const val ACTION_START = "com.simpulx.app.ACTION_START_ONGOING_CALL"
        const val ACTION_STOP = "com.simpulx.app.ACTION_STOP_ONGOING_CALL"

        fun start(
            context: Context,
            chatId: String,
            callId: String,
            contactName: String,
            statusText: String,
        ) {
            val intent = Intent(context, CallForegroundService::class.java).apply {
                action = ACTION_START
                putExtra("chatId", chatId)
                putExtra("callId", callId)
                putExtra("contactName", contactName)
                putExtra("statusText", statusText)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, CallForegroundService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }
}
