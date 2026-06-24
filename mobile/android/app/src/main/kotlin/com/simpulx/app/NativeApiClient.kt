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

    fun sendReply(context: Context, chatId: String, text: String, onSuccess: () -> Unit, onError: (Exception) -> Unit) {
        thread {
            try {
                val token = getToken(context)
                    ?: throw Exception("No access token found in secure storage")

                val url = URL("$API_BASE_URL/api/conversations/$chatId/messages")
                val connection = url.openConnection() as HttpURLConnection
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                connection.requestMethod = "POST"
                connection.setRequestProperty("Authorization", "Bearer $token")
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.doOutput = true

                val jsonParam = JSONObject()
                jsonParam.put("body", text)
                jsonParam.put("type", "text")

                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(jsonParam.toString())
                    writer.flush()
                }

                val responseCode = connection.responseCode
                if (responseCode in 200..299) {
                    Log.d(TAG, "Successfully sent background reply")
                    Handler(Looper.getMainLooper()).post {
                        onSuccess()
                    }
                } else {
                    val errorStream = connection.errorStream?.bufferedReader()?.use { it.readText() }
                    Log.e(TAG, "API Error: $responseCode - $errorStream")
                    throw Exception("API Error: $responseCode")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Exception in background reply", e)
                Handler(Looper.getMainLooper()).post {
                    onError(e)
                }
            }
        }
    }

    /**
     * Reject an incoming call by hitting POST /api/calls/{callId}/reject.
     */
    fun rejectCall(context: Context, callId: String, onDone: () -> Unit) {
        thread {
            try {
                val token = getToken(context)
                    ?: throw Exception("No access token found in secure storage")

                val url = URL("$API_BASE_URL/api/calls/$callId/reject")
                val connection = url.openConnection() as HttpURLConnection
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                connection.requestMethod = "POST"
                connection.setRequestProperty("Authorization", "Bearer $token")
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.doOutput = true
                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write("{}")
                    writer.flush()
                }

                val responseCode = connection.responseCode
                Log.d(TAG, "rejectCall response: $responseCode")
            } catch (e: Exception) {
                Log.e(TAG, "rejectCall failed", e)
            } finally {
                Handler(Looper.getMainLooper()).post { onDone() }
            }
        }
    }

    private fun getToken(context: Context): String? {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        val sharedPreferences = EncryptedSharedPreferences.create(
            context,
            "FlutterSecureKeyStorage",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

        // flutter_secure_storage prepends this prefix to keys on Android
        val prefix = "VGhpcyBpcyB0aGUgcHJlZml4IGZvciBhIHNlY3VyZSBzdG9yYWdlCg_"
        return sharedPreferences.getString("${prefix}access_token", null)
    }
}
