package com.akash.globaloneapp

import android.os.Bundle
import android.app.DatePickerDialog
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

class RegisterActivity : AppCompatActivity() {

    private lateinit var fullName: EditText
    private lateinit var phone: EditText
    private lateinit var pin: EditText
    private lateinit var email: EditText
    private lateinit var dob: EditText
    private lateinit var gender: Spinner
    private lateinit var androidIdText: TextView
    private lateinit var address: EditText
    private lateinit var saveBtn: Button

    private var androidId: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_register)
        EmployeeUi.decorateExisting(this, null, true)

        fullName = findViewById(R.id.etFullName)
        phone = findViewById(R.id.etPhone)
        pin = findViewById(R.id.etPin)
        email = findViewById(R.id.etEmail)
        dob = findViewById(R.id.etDob)
        gender = findViewById(R.id.spGender)
        androidIdText = findViewById(R.id.tvAndroidId)
        address = findViewById(R.id.etAddress)
        saveBtn = findViewById(R.id.btnSave)

        androidId = DeviceUtils.getAndroidId(this)

        androidIdText.text =
            if (androidId.isNotEmpty()) {
                "Android ID: $androidId"
            } else {
                "Android ID not found"
            }

        dob.isFocusable = false
        dob.setOnClickListener {
            val calendar = java.util.Calendar.getInstance()
            DatePickerDialog(this, { _, year, month, day ->
                dob.setText(String.format(java.util.Locale.ENGLISH, "%04d-%02d-%02d", year, month + 1, day))
            }, calendar.get(java.util.Calendar.YEAR) - 20, calendar.get(java.util.Calendar.MONTH), calendar.get(java.util.Calendar.DAY_OF_MONTH)).show()
        }

        val genderList = arrayOf("Select Gender", "Male", "Female", "Other")

        val genderAdapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_item,
            genderList
        )

        genderAdapter.setDropDownViewResource(
            android.R.layout.simple_spinner_dropdown_item
        )

        gender.adapter = genderAdapter

        saveBtn.setOnClickListener {
            registerEmployee()
        }
    }

    private fun registerEmployee() {
        val nameValue = fullName.text.toString().trim()
        val phoneValue = phone.text.toString().trim()
        val pinValue = pin.text.toString().trim()
        val emailValue = email.text.toString().trim()
        val dobValue = dob.text.toString().trim()
        val genderValue = gender.selectedItem.toString()
        val addressValue = address.text.toString().trim()

        if (nameValue.isEmpty()) {
            showToast("Please enter full name")
            return
        }

        if (!phoneValue.matches(Regex("^[0-9]{10}$"))) {
            showToast("Please enter valid 10 digit phone number")
            return
        }

        if (!pinValue.matches(Regex("^[0-9]{4}$"))) {
            showToast("Please enter valid 4 digit PIN")
            return
        }

        if (genderValue == "Select Gender") {
            showToast("Please select gender")
            return
        }

        if (androidId.isEmpty()) {
            showToast("Android ID not found")
            return
        }

        saveBtn.isEnabled = false
        saveBtn.text = "Saving..."

        val employeeId =
            "EMP" + System.currentTimeMillis().toString().takeLast(6)

        val data = JSONObject().apply {
            put("action", "addEmployee")
            put("employeeId", employeeId)
            put("fullName", nameValue)
            put("phone", phoneValue)
            put("pin", pinValue)
            put("email", emailValue)
            put("dob", dobValue)
            put("gender", genderValue)
            put("address", addressValue)

            put("department", "")
            put("designation", "")
            put("joiningDate", "")
            put("salary", "")
            put("shift", "")
            put("status", "Inactive")

            put("registeredIpAddress", "")
            // Temporarily bind the device on the employee's first approved login.
        }

        ApiClient.post(data) { success, message, _ ->
            runOnUiThread {
                resetButton()

                if (success) {
                    AppToast.success(this, "Employee registered successfully. Waiting for admin approval.")

                    finish()
                } else {
                    AppToast.error(this, message.ifEmpty { "Employee registration failed" })
                }
            }
        }
    }

    private fun resetButton() {
        saveBtn.isEnabled = true
        saveBtn.text = "Save Details"
    }

    private fun showToast(message: String) {
        AppToast.warning(this, message)
    }
}
