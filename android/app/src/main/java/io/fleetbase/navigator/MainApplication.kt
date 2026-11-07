package io.fleetbase.navigator

import android.app.Application
import android.content.res.Configuration
import io.fleetbase.navigator.location.DwcLocationPackage
import io.fleetbase.navigator.updates.DwcUpdatesPackage
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

class MainApplication : Application(), ReactApplication {
  private fun packages(): List<ReactPackage> = PackageList(reactNativeHost).packages.apply { add(DwcLocationPackage()); add(DwcUpdatesPackage()) }

  override val reactNativeHost: ReactNativeHost =
          object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> = packages()

            override fun getJSMainModuleName(): String = "index"

            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

            override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
          }

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList = packages(),
      jsMainModulePath = "index",
      useDevSupport = BuildConfig.DEBUG
    )
  }

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, OpenSourceMergedSoMapping)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted in for the New Architecture, we load the native entry point for this app.
      load()
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
