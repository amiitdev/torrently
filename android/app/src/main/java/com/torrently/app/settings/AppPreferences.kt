package com.torrently.app.settings

import android.content.Context
import android.content.SharedPreferences
import android.os.Environment
import java.io.File

data class AppSettings(
  val downloadDirectory: String,
  val downloadDirectoryTreeUri: String?,
  val maxActiveTorrents: Int,
  val downloadLimitBps: Int,
  val uploadLimitBps: Int,
  val maxConnections: Int,
  val maxPeersPerTorrent: Int,
  val wifiOnly: Boolean,
  val chargingOnly: Boolean,
  val notificationsEnabled: Boolean,
  val notificationProgress: Boolean,
  val autoResumeOnStart: Boolean,
  val seedAfterCompletion: Boolean,
  val sequentialDownload: Boolean,
  val totalDownloaded: Long,
  val totalUploaded: Long,
)

class AppPreferences(context: Context) {

  private val prefs: SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun defaultDownloadDirectory(context: Context): String {
    val base = context.getExternalFilesDir(null) ?: context.filesDir
    return File(base, "Downloads").absolutePath
  }

  fun read(context: Context): AppSettings {
    val defaultDir = defaultDownloadDirectory(context)
    return AppSettings(
      downloadDirectory = prefs.getString(KEY_DOWNLOAD_DIR, defaultDir) ?: defaultDir,
      downloadDirectoryTreeUri = prefs.getString(KEY_DOWNLOAD_DIR_TREE, null),
      maxActiveTorrents = prefs.getInt(KEY_MAX_ACTIVE, 3).coerceIn(1, 20),
      downloadLimitBps = prefs.getInt(KEY_DL_LIMIT, 0).coerceAtLeast(0),
      uploadLimitBps = prefs.getInt(KEY_UL_LIMIT, 0).coerceAtLeast(0),
      maxConnections = prefs.getInt(KEY_MAX_CONN, 200).coerceIn(10, 2000),
      maxPeersPerTorrent = prefs.getInt(KEY_MAX_PEERS, 60).coerceIn(2, 500),
      wifiOnly = prefs.getBoolean(KEY_WIFI_ONLY, false),
      chargingOnly = prefs.getBoolean(KEY_CHARGING_ONLY, false),
      notificationsEnabled = prefs.getBoolean(KEY_NOTIFY, true),
      notificationProgress = prefs.getBoolean(KEY_NOTIFY_PROGRESS, true),
      autoResumeOnStart = prefs.getBoolean(KEY_AUTO_RESUME, true),
      seedAfterCompletion = prefs.getBoolean(KEY_SEED, true),
      sequentialDownload = prefs.getBoolean(KEY_SEQUENTIAL, false),
      totalDownloaded = prefs.getLong(KEY_TOTAL_DL, 0L),
      totalUploaded = prefs.getLong(KEY_TOTAL_UL, 0L),
    )
  }

  fun write(settings: AppSettings) {
    prefs.edit()
      .putString(KEY_DOWNLOAD_DIR, settings.downloadDirectory)
      .putString(KEY_DOWNLOAD_DIR_TREE, settings.downloadDirectoryTreeUri)
      .putInt(KEY_MAX_ACTIVE, settings.maxActiveTorrents)
      .putInt(KEY_DL_LIMIT, settings.downloadLimitBps)
      .putInt(KEY_UL_LIMIT, settings.uploadLimitBps)
      .putInt(KEY_MAX_CONN, settings.maxConnections)
      .putInt(KEY_MAX_PEERS, settings.maxPeersPerTorrent)
      .putBoolean(KEY_WIFI_ONLY, settings.wifiOnly)
      .putBoolean(KEY_CHARGING_ONLY, settings.chargingOnly)
      .putBoolean(KEY_NOTIFY, settings.notificationsEnabled)
      .putBoolean(KEY_NOTIFY_PROGRESS, settings.notificationProgress)
      .putBoolean(KEY_AUTO_RESUME, settings.autoResumeOnStart)
      .putBoolean(KEY_SEED, settings.seedAfterCompletion)
      .putBoolean(KEY_SEQUENTIAL, settings.sequentialDownload)
      .putLong(KEY_TOTAL_DL, settings.totalDownloaded)
      .putLong(KEY_TOTAL_UL, settings.totalUploaded)
      .apply()
  }

  fun update(transform: (AppSettings) -> AppSettings): AppSettings {
    val next = transform(read(AppContextHolder.context))
    write(next)
    return next
  }

  companion object {
    private const val PREFS_NAME = "torrently_settings"
    private const val KEY_DOWNLOAD_DIR = "downloadDirectory"
    private const val KEY_DOWNLOAD_DIR_TREE = "downloadDirectoryTreeUri"
    private const val KEY_MAX_ACTIVE = "maxActiveTorrents"
    private const val KEY_DL_LIMIT = "downloadLimitBps"
    private const val KEY_UL_LIMIT = "uploadLimitBps"
    private const val KEY_MAX_CONN = "maxConnections"
    private const val KEY_MAX_PEERS = "maxPeersPerTorrent"
    private const val KEY_WIFI_ONLY = "wifiOnly"
    private const val KEY_CHARGING_ONLY = "chargingOnly"
    private const val KEY_NOTIFY = "notificationsEnabled"
    private const val KEY_NOTIFY_PROGRESS = "notificationProgress"
    private const val KEY_AUTO_RESUME = "autoResumeOnStart"
    private const val KEY_SEED = "seedAfterCompletion"
    private const val KEY_SEQUENTIAL = "sequentialDownload"
    private const val KEY_TOTAL_DL = "totalDownloaded"
    private const val KEY_TOTAL_UL = "totalUploaded"
  }
}

/**
 * Tiny application context holder so non-Activity code can read preferences
 * without retaining an Activity reference.
 */
object AppContextHolder {
  @Volatile
  lateinit var context: android.content.Context

  fun init(appContext: android.content.Context) {
    if (!::context.isInitialized) {
      context = appContext.applicationContext
    }
  }

  fun publicDownloadsDir(): File {
    return File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Torrently")
  }
}
