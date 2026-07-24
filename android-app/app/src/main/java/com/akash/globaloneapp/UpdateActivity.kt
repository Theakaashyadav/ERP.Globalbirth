package com.akash.globaloneapp

import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.content.FileProvider
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

class UpdateActivity : AppCompatActivity() {
    private val client = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(3, TimeUnit.MINUTES).build()
    private lateinit var title: TextView; private lateinit var message: TextView; private lateinit var progress: ProgressBar; private lateinit var action: Button
    private var release: JSONObject? = null; private var downloadedApk: File? = null; private var checking = false
    private val updateBaseUrl get() = AppConfig.API_URL.substringBeforeLast("/attendance") + "/app-update"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setFinishOnTouchOutside(false)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) { override fun handleOnBackPressed() = Unit })
        buildUi()
        checkForUpdate()
    }
    override fun onResume() { super.onResume(); if (downloadedApk != null && packageManager.canRequestPackageInstalls()) installDownloadedApk() }

    private fun buildUi() {
        val root = LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; gravity=Gravity.CENTER; setPadding(dp(12),dp(12),dp(12),dp(12)); setBackgroundColor(Color.TRANSPARENT) }
        val card = LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; gravity=Gravity.CENTER; setPadding(dp(26),dp(30),dp(26),dp(30)); background=GradientDrawable().apply{setColor(Color.WHITE);cornerRadius=dp(24).toFloat()}; elevation=dp(10).toFloat() }
        val badge=TextView(this).apply { text="GLOBAL ONE APP"; textSize=12f; setTextColor(Color.rgb(2,132,199)); gravity=Gravity.CENTER; setTypeface(typeface,1) }
        title=TextView(this).apply { text="Checking for updates"; textSize=26f; gravity=Gravity.CENTER; setTextColor(Color.rgb(15,23,42)); setTypeface(typeface,1); setPadding(0,dp(14),0,dp(8)) }
        message=TextView(this).apply { text="Please wait while we verify the latest mandatory version."; textSize=15f; gravity=Gravity.CENTER; setTextColor(Color.rgb(100,116,139)) }
        progress=ProgressBar(this).apply { isIndeterminate=true }
        action=Button(this).apply { text="Retry"; isAllCaps=false; visibility=Button.GONE; setOnClickListener { release?.let { downloadUpdate(it) } ?: checkForUpdate() } }
        card.addView(badge); card.addView(title); card.addView(message); card.addView(progress,LinearLayout.LayoutParams(dp(48),dp(48)).apply{topMargin=dp(22)}); card.addView(action,LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,dp(54)).apply{topMargin=dp(22)})
        root.addView(card,LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT)); setContentView(root)
    }
    private fun request(url:String)=Request.Builder().url(url).apply { if(AppConfig.API_KEY.isNotBlank()) header("Authorization","Bearer ${AppConfig.API_KEY}") }.build()
    private fun checkForUpdate() {
        if(checking)return; checking=true; showLoading("Checking for updates","Connecting to the update server...")
        client.newCall(request("$updateBaseUrl/latest")).enqueue(object:Callback{
            override fun onFailure(call:Call,e:IOException)=runOnUiThread{checking=false;showError("Update check required",e.localizedMessage?:"Cannot reach update server.")}
            override fun onResponse(call:Call,response:Response){response.use{val body=it.body?.string().orEmpty();runOnUiThread{checking=false;try{val json=JSONObject(body);val item=json.optJSONObject("release");if(!it.isSuccessful||!json.optBoolean("success"))showError("Update check failed",json.optString("message","Server error"))else if(!json.optBoolean("available")||item==null||item.optInt("versionCode")<=BuildConfig.VERSION_CODE)continueToApp()else{release=item;showRequired(item)}}catch(e:Exception){showError("Invalid update response",e.localizedMessage?:"Try again.")}}}}
        })
    }
    private fun showRequired(item:JSONObject){progress.visibility=ProgressBar.GONE;action.visibility=Button.VISIBLE;action.text="Download and Update";title.text="Mandatory update required";message.text="Version ${item.optString("versionName")} (build ${item.optInt("versionCode")})\n\n${item.optString("notes","Performance and security improvements.")}"}
    private fun downloadUpdate(item: JSONObject) {
        showLoading("Downloading update", "Keep the app open while the new version downloads.")
        val url = Uri.parse(updateBaseUrl).buildUpon()
            .encodedPath(item.optString("downloadUrl", "/api/app-update/download"))
            .build().toString()
        client.newCall(request(url)).enqueue(object : Callback {
            override fun onFailure(call: Call, error: IOException) = runOnUiThread {
                showError("Download failed", error.localizedMessage ?: "Try again.")
            }
            override fun onResponse(call: Call, response: Response) {
                response.use { result ->
                    if (!result.isSuccessful) {
                        runOnUiThread { showError("Download failed", "Server returned ${result.code}.") }
                        return
                    }
                    try {
                        val dir = File(externalCacheDir ?: cacheDir, "updates").apply { mkdirs() }
                        val file = File(dir, "GlobalOne-update.apk")
                        val stream = result.body?.byteStream() ?: throw IOException("Empty APK response")
                        stream.use { input -> file.outputStream().use { output -> input.copyTo(output) } }
                        if (!sha256(file).equals(item.optString("sha256"), true)) {
                            file.delete()
                            throw IOException("APK checksum verification failed.")
                        }
                        downloadedApk = file
                        runOnUiThread { requestInstall(file) }
                    } catch (error: Exception) {
                        runOnUiThread { showError("Update verification failed", error.localizedMessage ?: "Try again.") }
                    }
                }
            }
        })
    }
    private fun requestInstall(file:File){if(!packageManager.canRequestPackageInstalls()){title.text="Allow app updates";message.text="Enable 'Allow from this source', then return to continue the mandatory update.";progress.visibility=ProgressBar.GONE;action.visibility=Button.VISIBLE;action.text="Open Installation Settings";action.setOnClickListener{startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:$packageName")))}}else installDownloadedApk()}
    private fun installDownloadedApk(){val file=downloadedApk?:return;downloadedApk=null;val uri=FileProvider.getUriForFile(this,"$packageName.fileprovider",file);startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))}
    private fun continueToApp(){
        val destination = if(intent.getBooleanExtra("afterLogin",false)) DashboardActivity::class.java else LoginActivity::class.java
        startActivity(Intent(this,destination).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK));finish()
    }
    private fun showLoading(heading:String,detail:String){title.text=heading;message.text=detail;progress.visibility=ProgressBar.VISIBLE;action.visibility=Button.GONE}
    private fun showError(heading:String,detail:String){title.text=heading;message.text="$detail\n\nThis check is mandatory. Connect to the company server and retry.";progress.visibility=ProgressBar.GONE;action.visibility=Button.VISIBLE;action.text="Retry";action.setOnClickListener{checkForUpdate()}}
    private fun sha256(file:File):String{val digest=MessageDigest.getInstance("SHA-256");file.inputStream().use{input->val buffer=ByteArray(8192);while(true){val count=input.read(buffer);if(count<=0)break;digest.update(buffer,0,count)}};return digest.digest().joinToString(""){"%02x".format(it)}}
    private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
}
