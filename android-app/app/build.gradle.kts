plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    id("com.google.gms.google-services")
}

android {
    namespace = "com.akash.globaloneapp"

    compileSdk = 36

    defaultConfig {
        applicationId = "com.akash.globaloneapp"
        minSdk = 30
        targetSdk = 36
        versionCode = 26
        versionName = "1.20.1"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        val attendanceApiUrl = project.findProperty("ATTENDANCE_API_URL") ?: System.getenv("ATTENDANCE_API_URL") ?: "https://mediumslateblue-goose-217733.hostingersite.com/api/attendance"
        val attendanceApiKey = project.findProperty("ATTENDANCE_API_KEY") ?: System.getenv("ATTENDANCE_API_KEY") ?: ""
        buildConfigField("String", "ATTENDANCE_API_URL", "\"$attendanceApiUrl\"")
        buildConfigField("String", "ATTENDANCE_API_KEY", "\"$attendanceApiKey\"")
    }

    buildFeatures { buildConfig = true }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = "11"
    }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:34.16.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation(libs.androidx.core.ktx)

    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.1")

    implementation("androidx.biometric:biometric:1.1.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")



    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}
