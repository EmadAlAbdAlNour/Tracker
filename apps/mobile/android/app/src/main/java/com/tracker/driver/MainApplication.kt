package com.tracker.driver

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
        this,
        object : DefaultReactNativeHost(this) {
          override fun getPackages(): List<ReactPackage> {
            val packages = PackageList(this).packages.toMutableList()
            packages.add(TrackerNotificationPackage())
            packages.add(com.tracker.driver.tracking.TrackerLocationPackage())
            return packages
          }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
          override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, OpenSourceMergedSoMapping)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
    createNotificationChannels()
  }

  private fun createNotificationChannels() {
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      val notificationManager = getSystemService(android.app.NotificationManager::class.java)
      if (notificationManager != null) {
        val trackingChannel = android.app.NotificationChannel(
          "tracker_tracking_channel",
          "Active Tracking Service",
          android.app.NotificationManager.IMPORTANCE_LOW
        ).apply {
          description = "Persistent status while driver shift and location tracking are active"
          setShowBadge(false)
        }

        val alertsChannel = android.app.NotificationChannel(
          "tracker_alerts_channel",
          "Operational Alerts",
          android.app.NotificationManager.IMPORTANCE_HIGH
        ).apply {
          description = "High-priority fleet alerts, incident warnings, and geofence notifications"
          enableVibration(true)
          setShowBadge(true)
        }

        val systemChannel = android.app.NotificationChannel(
          "tracker_system_channel",
          "System & Account Notifications",
          android.app.NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
          description = "Account updates, device status, and system notices"
          setShowBadge(true)
        }

        notificationManager.createNotificationChannels(listOf(trackingChannel, alertsChannel, systemChannel))
      }
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
