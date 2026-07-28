package com.akash.globaloneapp

import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

object ApiClient {

    private val client = SecureHttpClientFactory.builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    fun post(
        json: JSONObject,
        callback: (Boolean, String, JSONObject?) -> Unit
    ) {
        val authenticatedJson = JSONObject(json.toString())
        val action = authenticatedJson.optString("action")
        if (action != "submitAppFeedback") AppFeedbackReporter.lastAction = action.ifBlank { "Unknown action" }
        val publicActions = setOf("addEmployee", "webLoginEmployee", "mobileLoginEmployee", "loginDashboardUser")
        if (action !in publicActions && !authenticatedJson.has("androidId")) {
            authenticatedJson.put("androidId", DeviceUtils.getAndroidId(GlobalOneApplication.instance))
        }
        val body = authenticatedJson.toString().toRequestBody("application/json; charset=utf-8".toMediaType())

        val builder = Request.Builder().url(AppConfig.API_URL).post(body)
        if (AppConfig.API_KEY.isNotBlank()) builder.header("Authorization", "Bearer ${AppConfig.API_KEY}")
        val employeeToken = SessionManager(GlobalOneApplication.instance).getSessionToken()
        if (employeeToken.isNotBlank()) builder.header("X-Employee-Session", employeeToken)
        val request = builder.build()

        client.newCall(request).enqueue(object : Callback {

            override fun onFailure(call: Call, e: IOException) {
                Log.e("GlobalOneApi", "Request failed for $action at ${AppConfig.API_URL}", e)
                callback(false, "Cannot connect to attendance server (${AppConfig.API_URL}). ${e.localizedMessage ?: "Check the server address and network."}", null)
            }

            override fun onResponse(call: Call, response: Response) {
                val text = response.body?.string()

                if (text.isNullOrEmpty()) {
                    callback(false, "Empty server response", null)
                    return
                }

                try {
                    val jsonResponse = JSONObject(text)

                    val success = response.isSuccessful && jsonResponse.optBoolean("success", false)
                    val message = jsonResponse.optString(
                        "message",
                        if (success) "Success" else "Request failed"
                    )

                    callback(success, message, jsonResponse)

                } catch (e: Exception) {
                    callback(false, "Invalid server response", null)
                }
            }
        })
    }
}
