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

object NativeApiClient {

    private const val TAG = "NativeApiClient"
    private const val API_BASE_URL = "https://app.simpulx.com" // Prod URL

    fun sendReply(context: Context, chatId: String, text: String, onSuccess: () -> Unit, onError: (Exception) -> Unit) {
        thread {
            try {
                // 1. Get token from flutter_secure_storage
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
                val token = sharedPreferences.getString("${prefix}access_token", null)

                if (token == null) {
                    throw Exception("No access token found in secure storage")
                }

                // 2. Make HTTP POST Request
                val url = URL("$API_BASE_URL/api/conversations/$chatId/messages")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Authorization", "Bearer $token")
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.doOutput = true

                val jsonParam = JSONObject()
                jsonParam.put("body", text)

                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(jsonParam.toString())
                    writer.flush()
                }

                val responseCode = connection.responseCode
                if (responseCode in 200..299) {
                    Log.d(TAG, "Successfully sent background reply")
                    onSuccess()
                } else {
                    val errorMsg = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "Unknown error"
                    throw Exception("API Error $responseCode: $errorMsg")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Background reply failed", e)
                onError(e)
            }
        }
    }
}
