plugins {
    id("com.android.application")
}

val releaseStoreFile = providers.environmentVariable("XPL_RELEASE_STORE_FILE").orNull
val releaseStorePassword = providers.environmentVariable("XPL_RELEASE_STORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("XPL_RELEASE_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("XPL_RELEASE_KEY_PASSWORD").orNull
val hasReleaseSigning = listOf(releaseStoreFile, releaseStorePassword, releaseKeyAlias, releaseKeyPassword)
    .all { !it.isNullOrBlank() }

android {
    namespace = "com.luminshot.receipt"
    compileSdk = 37 // AndroidX Core 1.19.0 requires API 37; targetSdk remains 36.

    defaultConfig {
        applicationId = "com.luminshot.piao"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "1.0.1"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseStoreFile!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                storeType = "PKCS12"
            }
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            if (hasReleaseSigning) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

tasks.register("verifyReleaseSigning") {
    doLast {
        if (!hasReleaseSigning) throw GradleException("Release signing credentials are missing; use ./build-release.sh")
        if (!file(releaseStoreFile!!).isFile) throw GradleException("Release keystore file is missing")
    }
}
tasks.matching { it.name == "assembleRelease" || it.name == "bundleRelease" }.configureEach {
    dependsOn("verifyReleaseSigning")
}

dependencies {
    implementation("androidx.activity:activity:1.13.0")
    implementation("androidx.core:core:1.19.0")
    implementation("androidx.webkit:webkit:1.18.0")
}
