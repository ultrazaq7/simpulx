package com.simpulx.app

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread
import android.os.Handler
import android.os.Looper

object NativeApiClient {

    private const val TAG = "NativeApiClient"
    private const val API_BASE_URL = "https://app.simpulx.com" // Prod URL

    // Native-owned encrypted store. Flutter mirrors the JWT here on every token
    // change (see SecureStore + syncNativeAuth) so the background reply/reject
    // path never depends on flutter_secure_storage's internal file/key format,
    // which changed across major versions and silently broke token reads.
    private const val NATIVE_PREFS = "SimpulxNativeAuth"
    private const val KEY_ACCESS = "access_token"
    private const val KEY_REFRESH = "refresh_token"

    fun sendReply(context: Context, chatId: String, text: String, onSuccess: () -> Unit, onError: (Exception) -> Unit) {
        thread {
            try {
                // Retry once after a token refresh so a stale 15-min access token
                // (the usual cause of "Failed to send reply") doesn't fail the reply.
                val code = postWithAuth(context) { token ->
                    val json = JSONObject().apply {
                        put("body", text)
                        put("type", "text")
                    }
                    postJson("$API_BASE_URL/api/conversations/$chatId/messages", token, json.toString())
                }
                if (code in 200..299) {
                    Handler(Looper.getMainLooper()).post { onSuccess() }
                } else {
                    throw Exception("API Error: $code")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Exception in background reply", e)
                Handler(Looper.getMainLooper()).post { onError(e) }
            }
        }
    }

    /**
     * Reject an incoming call by hitting POST /api/calls/{callId}/reject.
     */
    fun rejectCall(context: Context, callId: String, onDone: () -> Unit) {
        thread {
            try {
                val code = postWithAuth(context) { token ->
                    postJson("$API_BASE_URL/api/calls/$callId/reject", token, "{}")
                }
                Log.d(TAG, "rejectCall response: $code")
            } catch (e: Exception) {
                Log.e(TAG, "rejectCall failed", e)
            } finally {
                Handler(Looper.getMainLooper()).post { onDone() }
            }
        }
    }

    /**
     * Run an authenticated POST, refreshing the access token once on 401.
     * [call] receives the bearer token and returns the HTTP status code.
     */
    private fun postWithAuth(context: Context, call: (token: String) -> Int): Int {
        val token = getToken(context) ?: throw Exception("No access token found in secure storage")
        var code = call(token)
        if (code == 401) {
            val refreshed = refreshAccessToken(context)
            if (refreshed != null) {
                code = call(refreshed)
            }
        }
        return code
    }

    /** POST a JSON body with a bearer token; returns the HTTP status code. */
    private fun postJson(url: String, token: String, body: String): Int {
        val connection = URL(url).openConnection() as HttpURLConnection
        return try {
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.requestMethod = "POST"
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.doOutput = true
            OutputStreamWriter(connection.outputStream).use { it.write(body); it.flush() }
            val code = connection.responseCode
            if (code !in 200..299) {
                val err = connection.errorStream?.bufferedReader()?.use { it.readText() }
                Log.e(TAG, "API Error: $code - $err")
            }
            code
        } finally {
            connection.disconnect()
        }
    }

    /**
     * Exchange the stored refresh token for a fresh access token and persist both.
     * Returns the new access token, or null if refresh failed (e.g. logged out).
     */
    private fun refreshAccessToken(context: Context): String? {
        val refresh = getRefreshToken(context) ?: return null
        return try {
            val connection = URL("$API_BASE_URL/auth/refresh").openConnection() as HttpURLConnection
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.doOutput = true
            val reqBody = JSONObject().put("refresh_token", refresh).toString()
            OutputStreamWriter(connection.outputStream).use { it.write(reqBody); it.flush() }
            val code = connection.responseCode
            if (code !in 200..299) {
                Log.e(TAG, "Token refresh failed: $code")
                connection.disconnect()
                return null
            }
            val resp = connection.inputStream.bufferedReader().use { it.readText() }
            connection.disconnect()
            val json = JSONObject(resp)
            val newAccess = json.optString("token", "")
            val newRefresh = json.optString("refresh_token", refresh)
            if (newAccess.isEmpty()) return null
            saveTokens(context, newAccess, newRefresh)
            newAccess
        } catch (e: Exception) {
            Log.e(TAG, "Token refresh exception", e)
            null
        }
    }

    private fun prefs(context: Context) = EncryptedSharedPreferences.create(
        context,
        NATIVE_PREFS,
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private fun getToken(context: Context): String? =
        prefs(context).getString(KEY_ACCESS, null)

    private fun getRefreshToken(context: Context): String? =
        prefs(context).getString(KEY_REFRESH, null)

    private fun saveTokens(context: Context, access: String, refresh: String) {
        prefs(context).edit()
            .putString(KEY_ACCESS, access)
            .putString(KEY_REFRESH, refresh)
            .apply()
    }

    /** Called from Flutter (MethodChannel) to mirror the current JWT natively. */
    fun storeTokens(context: Context, access: String, refresh: String?) {
        val e = prefs(context).edit().putString(KEY_ACCESS, access)
        if (!refresh.isNullOrEmpty()) e.putString(KEY_REFRESH, refresh)
        e.apply()
    }

    fun clearTokens(context: Context) {
        prefs(context).edit().remove(KEY_ACCESS).remove(KEY_REFRESH).apply()
    }
}
