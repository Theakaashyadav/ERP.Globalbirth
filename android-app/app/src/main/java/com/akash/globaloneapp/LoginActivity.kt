package com.akash.globaloneapp

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject

class LoginActivity : AppCompatActivity() {
    private lateinit var session: SessionManager
    private lateinit var phone: EditText
    private lateinit var pin: EditText
    private lateinit var pinPanel: LinearLayout
    private lateinit var biometricPanel: LinearLayout
    private lateinit var loginBtn: Button
    private var biometricPromptShown = false

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun bg(color: String, radius: Float = 22f, stroke: String? = null) = GradientDrawable().apply { setColor(Color.parseColor(color)); cornerRadius=radius; if(stroke!=null)setStroke(1,Color.parseColor(stroke)) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionManager(this)
        setContentView(buildUi())
        showInitialMode()
    }

    private fun buildUi(): View {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor=Color.parseColor("#102A43")
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars=false
        val page=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(dp(18),dp(24),dp(18),dp(28)); setBackgroundColor(Color.parseColor("#F3F6FB")) }
        ViewCompat.setOnApplyWindowInsetsListener(page) { view, insets ->
            val top = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
            view.setPadding(dp(18), top + dp(16), dp(18), dp(28))
            insets
        }
        val hero=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; gravity=Gravity.CENTER; setPadding(dp(20),dp(24),dp(20),dp(25)); background=GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(Color.parseColor("#0F172A"),Color.parseColor("#1D4ED8"),Color.parseColor("#0891B2"))).apply{cornerRadius=dp(28).toFloat()}; elevation=dp(8).toFloat() }
        hero.addView(FrameLayout(this).apply { background=bg("#FFFFFF",50f); elevation=dp(6).toFloat(); addView(ImageView(this@LoginActivity).apply { setImageResource(R.mipmap.ic_launcher); scaleType=ImageView.ScaleType.CENTER_CROP },FrameLayout.LayoutParams(dp(82),dp(82),Gravity.CENTER)) },LinearLayout.LayoutParams(dp(92),dp(92)))
        hero.addView(TextView(this).apply{text="Global One";textSize=28f;typeface=Typeface.DEFAULT_BOLD;setTextColor(Color.WHITE);gravity=Gravity.CENTER;setPadding(0,dp(13),0,0)})
        hero.addView(TextView(this).apply{text="Employee Workspace";textSize=14f;setTextColor(Color.parseColor("#DBEAFE"));gravity=Gravity.CENTER;setPadding(0,dp(4),0,dp(12))})
        hero.addView(TextView(this).apply{text="SECURE  •  SIMPLE  •  CONNECTED";textSize=10.5f;typeface=Typeface.DEFAULT_BOLD;letterSpacing=.1f;setTextColor(Color.WHITE);gravity=Gravity.CENTER;background=bg("#22FFFFFF",30f);setPadding(dp(12),dp(6),dp(12),dp(6))})
        page.addView(hero,LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT).apply{bottomMargin=dp(18)})

        biometricPanel=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setPadding(dp(22),dp(25),dp(22),dp(22));background=bg("#FFFFFF",24f,"#E2E8F0");elevation=dp(4).toFloat() }
        biometricPanel.addView(FrameLayout(this).apply { background=bg("#EFF6FF",50f); addView(ImageView(this@LoginActivity).apply { setImageResource(R.drawable.ic_login_fingerprint); setColorFilter(Color.parseColor("#2563EB")); setPadding(dp(15),dp(15),dp(15),dp(15)) },FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT)) },LinearLayout.LayoutParams(dp(76),dp(76)).apply{bottomMargin=dp(12)})
        biometricPanel.addView(TextView(this).apply{text="Welcome back";textSize=23f;typeface=Typeface.DEFAULT_BOLD;gravity=Gravity.CENTER;setTextColor(Color.parseColor("#102A43"))})
        biometricPanel.addView(TextView(this).apply{text="Confirm your identity to continue securely";textSize=14f;gravity=Gravity.CENTER;setTextColor(Color.parseColor("#64748B"));setPadding(0,dp(7),0,dp(16))})
        biometricPanel.addView(primaryButton("Unlock with Biometrics","#2563EB"){loginWithBiometric()})
        biometricPanel.addView(secondaryButton("Use 4-digit PIN instead"){showPinMode()})
        page.addView(biometricPanel)

        pinPanel=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(22),dp(24),dp(22),dp(24));background=bg("#FFFFFF",24f,"#E2E8F0");elevation=dp(3).toFloat() }
        pinPanel.addView(TextView(this).apply{text="Employee Login";textSize=23f;typeface=Typeface.DEFAULT_BOLD;setTextColor(Color.parseColor("#102A43"))})
        pinPanel.addView(TextView(this).apply{text="Enter your registered phone and 4-digit PIN";textSize=14f;setTextColor(Color.parseColor("#64748B"));setPadding(0,dp(5),0,dp(18))})
        phone=input("10-digit phone number",InputType.TYPE_CLASS_PHONE,R.drawable.ic_login_phone).also{it.setText(session.getRememberedPhone())}
        pin=input("4-digit PIN",InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD,R.drawable.ic_login_lock).apply{filters=arrayOf(android.text.InputFilter.LengthFilter(4))}
        pinPanel.addView(label("PHONE NUMBER"));pinPanel.addView(phone)
        pinPanel.addView(label("SECURE PIN"));pinPanel.addView(pin)
        loginBtn=primaryButton("Sign In Securely","#2563EB"){submitPin()}
        pinPanel.addView(loginBtn)
        if (biometricAvailable() && session.hasRememberedLogin()) pinPanel.addView(secondaryButton("Use Biometrics"){loginWithBiometric()})
        pinPanel.addView(secondaryButton("Register New Employee"){startActivity(Intent(this@LoginActivity,RegisterActivity::class.java))})
        page.addView(pinPanel)
        return ScrollView(this).apply { isFillViewport=true;addView(page) }
    }

    private fun label(value:String)=TextView(this).apply{text=value;textSize=12f;typeface=Typeface.DEFAULT_BOLD;setTextColor(Color.parseColor("#64748B"));setPadding(dp(2),dp(12),0,dp(6));letterSpacing=.08f}
    private fun input(hintValue:String,type:Int,icon:Int)=EditText(this).apply{hint=hintValue;inputType=type;textSize=16f;minHeight=dp(56);setTextColor(Color.parseColor("#102A43"));setHintTextColor(Color.parseColor("#94A3B8"));setCompoundDrawablesRelativeWithIntrinsicBounds(icon,0,0,0);compoundDrawablePadding=dp(11);setPadding(dp(15),dp(13),dp(15),dp(13));background=bg("#F8FAFC",16f,"#CBD5E1")}
    private fun primaryButton(value:String,color:String,click:()->Unit)=Button(this).apply{text=value;isAllCaps=false;textSize=16f;typeface=Typeface.DEFAULT_BOLD;setTextColor(Color.WHITE);background=GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,intArrayOf(Color.parseColor(color),Color.parseColor("#0891B2"))).apply{cornerRadius=dp(17).toFloat()};elevation=dp(4).toFloat();layoutParams=LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,dp(56)).apply{topMargin=dp(16)};setOnClickListener{click()}}
    private fun secondaryButton(value:String,click:()->Unit)=Button(this).apply{text=value;isAllCaps=false;textSize=14f;typeface=Typeface.DEFAULT_BOLD;setTextColor(Color.parseColor("#2563EB"));background=bg("#EFF6FF",17f,"#DBEAFE");layoutParams=LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,dp(52)).apply{topMargin=dp(10)};setOnClickListener{click()}}

    private fun biometricAvailable() = BiometricManager.from(this).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL)==BiometricManager.BIOMETRIC_SUCCESS
    private fun showInitialMode(){ if(biometricAvailable()&&session.hasRememberedLogin()){biometricPanel.visibility=View.VISIBLE;pinPanel.visibility=View.GONE;biometricPanel.postDelayed({if(!biometricPromptShown)loginWithBiometric()},350)}else showPinMode() }
    private fun showPinMode(){biometricPanel.visibility=View.GONE;pinPanel.visibility=View.VISIBLE;phone.clearFocus();pin.clearFocus()}

    private fun submitPin(){
        val phoneValue=phone.text.toString().trim();val pinValue=pin.text.toString().trim()
        if(!phoneValue.matches(Regex("^[0-9]{10}$"))){toast("Enter a valid 10-digit phone number");return}
        if(!pinValue.matches(Regex("^[0-9]{4}$"))){toast("Enter a valid 4-digit PIN");return}
        loginBtn.isEnabled=false;loginBtn.text="Checking..."
        val androidId=DeviceUtils.getAndroidId(this)
        ApiClient.post(JSONObject().put("action","mobileLoginEmployee").put("phone",phoneValue).put("pin",pinValue).put("androidId",androidId)){ok,message,response->runOnUiThread{
            loginBtn.isEnabled=true;loginBtn.text="Sign In Securely"
            val employee=response?.optJSONObject("employee")
            if(!ok||employee==null){toast(message);return@runOnUiThread}
            session.saveLogin(employee.optString("employeeId"),employee.optString("phone",phoneValue),employee.optString("fullName"),employee.optString("email"),employee.optString("department"),employee.optString("designation"),androidId)
            openDashboard()
        }}
    }

    private fun loginWithBiometric(){
        if(!biometricAvailable()||!session.hasRememberedLogin()){showPinMode();toast("Sign in with your PIN once to enable biometric login.");return}
        biometricPromptShown=true
        val prompt=BiometricPrompt(this,ContextCompat.getMainExecutor(this),object:BiometricPrompt.AuthenticationCallback(){
            override fun onAuthenticationSucceeded(result:BiometricPrompt.AuthenticationResult){
                val currentAndroidId=DeviceUtils.getAndroidId(this@LoginActivity)
                if(session.getAndroidId()!=currentAndroidId){session.forgetLogin();showPinMode();toast("Device identity changed. Sign in with PIN again.");return}
                ApiClient.post(JSONObject().put("action","validateMobileSession").put("employeeId",session.getEmployeeId()).put("phone",session.getPhone()).put("androidId",currentAndroidId)){ok,message,response->runOnUiThread{
                    val employee=response?.optJSONObject("employee")
                    if(!ok||employee==null){session.logout();showPinMode();toast(message.ifBlank{"Account or device verification failed."});return@runOnUiThread}
                    session.saveLogin(employee.optString("employeeId"),employee.optString("phone"),employee.optString("fullName"),employee.optString("email"),employee.optString("department"),employee.optString("designation"),currentAndroidId)
                    openDashboard()
                }}
            }
            override fun onAuthenticationError(errorCode:Int,errString:CharSequence){if(errorCode!=BiometricPrompt.ERROR_USER_CANCELED&&errorCode!=BiometricPrompt.ERROR_NEGATIVE_BUTTON)toast(errString.toString())}
        })
        prompt.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle("Unlock Global One").setSubtitle("Use fingerprint, face, or device lock").setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL).build())
    }

    private fun openDashboard(){
        startActivity(Intent(this,DashboardActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
        finish()
    }
    private fun toast(value:String)=AppToast.smart(this,value)
}
