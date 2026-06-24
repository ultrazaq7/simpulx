import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Firebase Cloud Messaging.
    id("com.google.gms.google-services")
}

// Release signing credentials (gitignored). Absent on machines without the
// keystore -> the release build falls back to debug signing so it still runs.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    // Matches the preserved Firebase config (google-services.json / plist).
    namespace = "com.simpulx.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    buildFeatures {
        // Enable BuildConfig for flavor detection in Dart
        buildConfig = true
    }

    compileOptions {
        // Required by flutter_local_notifications (java.time desugaring).
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.simpulx.app"
        // Firebase + secure storage + notifications baseline.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        multiDexEnabled = true
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties["keyAlias"] as String?
                keyPassword = keystoreProperties["keyPassword"] as String?
                storeFile = (keystoreProperties["storeFile"] as String?)
                    ?.let { rootProject.file(it) }
                storePassword = keystoreProperties["storePassword"] as String?
            }
        }
    }

    // Build flavors for different environments
    flavorDimensions += "environment"
    productFlavors {
        create("dev") {
            dimension = "environment"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            // Pass flavor name to Dart via BuildConfig
            buildConfigField("String", "FLAVOR_NAME", "\"dev\"")
            resValue("string", "flavor_name", "Simpulx Dev")
        }
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            buildConfigField("String", "FLAVOR_NAME", "\"staging\"")
            resValue("string", "flavor_name", "Simpulx Staging")
        }
        create("prod") {
            dimension = "environment"
            // No suffix for production - uses default applicationId
            buildConfigField("String", "FLAVOR_NAME", "\"prod\"")
            resValue("string", "flavor_name", "Simpulx")
        }
    }

    buildTypes {
        debug {
            // Faster builds, no minification
            isMinifyEnabled = false
            isDebuggable = true
        }
        release {
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
