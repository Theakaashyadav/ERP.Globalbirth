package com.akash.globaloneapp

import android.content.Context

class SessionManager(context: Context) {

    private val pref =
        context.getSharedPreferences("GLOBAL_ONE_APP", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_LOGIN = "LOGIN"
        private const val KEY_EMPLOYEE_ID = "EMPLOYEE_ID"
        private const val KEY_PHONE = "PHONE"
        private const val KEY_FULL_NAME = "FULL_NAME"
        private const val KEY_EMAIL = "EMAIL"
        private const val KEY_DEPARTMENT = "DEPARTMENT"
        private const val KEY_DESIGNATION = "DESIGNATION"
        private const val KEY_ANDROID_ID = "ANDROID_ID"
        private const val KEY_LOGIN_TIME = "LOGIN_TIME"
        private const val KEY_FEATURES = "MOBILE_FEATURES"

        private const val SESSION_LIMIT = 10 * 60 * 1000L
    }

    fun saveLogin(
        employeeId: String,
        phone: String,
        fullName: String,
        email: String = "",
        department: String = "",
        designation: String = "",
        androidId: String
    ) {
        pref.edit()
            .putBoolean(KEY_LOGIN, true)
            .putString(KEY_EMPLOYEE_ID, employeeId)
            .putString(KEY_PHONE, phone)
            .putString(KEY_FULL_NAME, fullName)
            .putString(KEY_EMAIL, email)
            .putString(KEY_DEPARTMENT, department)
            .putString(KEY_DESIGNATION, designation)
            .putString(KEY_ANDROID_ID, androidId)
            .putLong(KEY_LOGIN_TIME, System.currentTimeMillis())
            .apply()
    }

    fun logout() {
        pref.edit()
            .putBoolean(KEY_LOGIN, false)
            .remove(KEY_LOGIN_TIME)
            .apply()
    }

    fun hasRememberedLogin(): Boolean {
        return getEmployeeId().isNotEmpty() && getPhone().isNotEmpty() && getAndroidId().isNotEmpty()
    }

    fun unlockRememberedLogin() {
        pref.edit()
            .putBoolean(KEY_LOGIN, true)
            .putLong(KEY_LOGIN_TIME, System.currentTimeMillis())
            .apply()
    }

    fun getRememberedPhone(): String = getPhone()

    fun forgetLogin() {
        pref.edit().clear().apply()
    }

    fun isLoggedIn(): Boolean {
        val isLogin = pref.getBoolean(KEY_LOGIN, false)
        val loginTime = pref.getLong(KEY_LOGIN_TIME, 0L)

        if (!isLogin || loginTime == 0L) {
            logout()
            return false
        }

        val currentTime = System.currentTimeMillis()
        val sessionExpired = currentTime - loginTime > SESSION_LIMIT

        if (sessionExpired) {
            logout()
            return false
        }

        return true
    }

    fun getEmployeeId(): String {
        return pref.getString(KEY_EMPLOYEE_ID, "") ?: ""
    }

    fun getPhone(): String {
        return pref.getString(KEY_PHONE, "") ?: ""
    }

    fun getFullName(): String {
        return pref.getString(KEY_FULL_NAME, "") ?: ""
    }

    fun getEmail(): String {
        return pref.getString(KEY_EMAIL, "") ?: ""
    }

    fun getDepartment(): String {
        return pref.getString(KEY_DEPARTMENT, "") ?: ""
    }

    fun isSalesEmployee(): Boolean = getDepartment().trim().equals("Sales", ignoreCase = true)
    fun isTeamLead(): Boolean {
        val role = getDesignation().trim().lowercase()
        return isSalesEmployee() && role in setOf("tl", "team lead", "teamlead")
    }

    fun getDesignation(): String {
        return pref.getString(KEY_DESIGNATION, "") ?: ""
    }

    fun getAndroidId(): String {
        return pref.getString(KEY_ANDROID_ID, "") ?: ""
    }

    fun saveMobileFeatures(features: Set<String>) {
        pref.edit().putStringSet(KEY_FEATURES, features).apply()
    }

    fun getMobileFeatures(): Set<String> {
        val saved = pref.getStringSet(KEY_FEATURES, null)
        if (saved != null) return saved.toSet()
        return setOf("attendance", "leads", "alerts", "profile")
    }

    fun hasMobileFeature(feature: String): Boolean = getMobileFeatures().contains(feature)

    fun updateAndroidId(androidId: String) {
        pref.edit()
            .putString(KEY_ANDROID_ID, androidId)
            .apply()
    }

    fun updateProfile(
        fullName: String,
        email: String,
        department: String,
        designation: String
    ) {
        pref.edit()
            .putString(KEY_FULL_NAME, fullName)
            .putString(KEY_EMAIL, email)
            .putString(KEY_DEPARTMENT, department)
            .putString(KEY_DESIGNATION, designation)
            .apply()
    }
}
