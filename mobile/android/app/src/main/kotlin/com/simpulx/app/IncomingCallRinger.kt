package com.simpulx.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * Reliable, LOOPING incoming-call ringtone + repeating vibration (WhatsApp-style).
 *
 * Why not rely on the notification channel sound: a channel sound plays only ONCE
 * when the notification is posted, and a full-screen-intent CATEGORY_CALL
 * notification can have that one-shot sound suppressed by the OS — so calls came
 * in silent. This owns the audio/vibration for the whole ring, independent of the
 * channel (which is now silent). Tied to the incoming-call notification lifecycle:
 * started in NotificationHelper.showCallNotification, stopped in
 * cancelCallNotification (answer / decline / end / timeout).
 *
 * Respects the device ringer mode like a real phone: NORMAL = sound + vibrate,
 * VIBRATE = vibrate only, SILENT = nothing.
 */
object IncomingCallRinger {
    private const val TAG = "IncomingCallRinger"
    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null

    @Synchronized
    fun start(context: Context) {
        stop(context) // never stack two rings
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val mode = am?.ringerMode ?: AudioManager.RINGER_MODE_NORMAL

        if (mode == AudioManager.RINGER_MODE_NORMAL) {
            try {
                val uri: Uri = RingtoneManager.getActualDefaultRingtoneUri(
                    context, RingtoneManager.TYPE_RINGTONE
                ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                val rt = RingtoneManager.getRingtone(context, uri)
                rt?.audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                // Looping is API 28+; on older devices it plays one cycle (vibration
                // still repeats), which is an acceptable fallback.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    rt?.isLooping = true
                }
                rt?.play()
                ringtone = rt
            } catch (e: Exception) {
                Log.e(TAG, "ringtone start failed", e)
            }
        }

        if (mode != AudioManager.RINGER_MODE_SILENT) {
            try {
                val vib = getVibrator(context)
                val pattern = longArrayOf(0, 1000, 1000) // buzz 1s, pause 1s, repeat
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vib?.vibrate(VibrationEffect.createWaveform(pattern, 0))
                } else {
                    @Suppress("DEPRECATION")
                    vib?.vibrate(pattern, 0)
                }
                vibrator = vib
            } catch (e: Exception) {
                Log.e(TAG, "vibrate start failed", e)
            }
        }
    }

    @Synchronized
    fun stop(context: Context) {
        try { ringtone?.stop() } catch (_: Exception) {}
        ringtone = null
        try { vibrator?.cancel() } catch (_: Exception) {}
        vibrator = null
    }

    private fun getVibrator(context: Context): Vibrator? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)
                ?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }
}
