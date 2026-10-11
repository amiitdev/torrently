package com.torrently.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.torrently.app.settings.AppContextHolder
import com.torrently.app.torrent.TorrentEngine

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(com.torrently.app.bridge.TorrentPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    AppContextHolder.init(this)
    loadReactNative(this)

    // Keep transfers alive across activity/JS recreation. The engine is started
    // lazily from JS so we never pay the cost before the user needs it.
    try {
      TorrentEngine.get(this)
    } catch (t: Throwable) {
      // Initialization happens explicitly from JS; ignore here.
    }
  }
}
