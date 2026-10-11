package com.torrently.app.bridge

import android.content.Intent
import android.net.Uri
import android.os.StatFs
import android.util.Log
import androidx.activity.ComponentActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.torrently.app.R
import com.torrently.app.settings.AppPreferences
import com.torrently.app.settings.AppSettings
import com.torrently.app.storage.SafStorage
import com.torrently.app.torrent.EngineEvent
import com.torrently.app.torrent.EngineEventBus
import com.torrently.app.torrent.EngineException
import com.torrently.app.torrent.TorrentEngine
import java.io.File
import java.util.concurrent.TimeUnit

@ReactModule(name = TorrentModule.NAME)
class TorrentModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val prefs = AppPreferences(reactContext)
  private val eventListener = EngineEventBus.Listener { event -> dispatch(event) }

  init {
    EngineEventBus.addListener(eventListener)
  }

  override fun getName(): String = NAME

  override fun invalidate() {
    EngineEventBus.removeListener(eventListener)
    super.invalidate()
  }

  // ---------------------------------------------------------------- events

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun dispatch(event: EngineEvent) {
    val context = reactContext
    val (name, payload) = when (event) {
      is EngineEvent.TorrentAdded ->
        "onTorrentAdded" to Arguments.createMap().apply { putMap("torrent", RnConvert.summary(event.torrent)) }
      is EngineEvent.MetadataReceived ->
        "onTorrentMetadataReceived" to Arguments.createMap().apply { putMap("torrent", RnConvert.summary(event.torrent)) }
      is EngineEvent.StateChanged ->
        "onTorrentStateChanged" to Arguments.createMap().apply { putMap("torrent", RnConvert.summary(event.torrent)) }
      is EngineEvent.Progress ->
        "onTorrentProgress" to Arguments.createMap().apply { putArray("torrents", RnConvert.summaryArray(event.torrents)) }
      is EngineEvent.TorrentRemoved ->
        "onTorrentRemoved" to Arguments.createMap().apply { putString("torrentId", event.torrentId) }
      is EngineEvent.TorrentError ->
        "onTorrentError" to Arguments.createMap().apply {
          putString("torrentId", event.torrentId)
          putString("error", event.message)
          if (event.torrent == null) putNull("torrent") else putMap("torrent", RnConvert.summary(event.torrent))
        }
      is EngineEvent.EngineStatusChanged ->
        "onEngineStatusChanged" to Arguments.createMap().apply { putMap("status", RnConvert.engineStatus(event.status)) }
    }

    try {
      context.emitDeviceEvent(name, payload)
    } catch (t: Throwable) {
      Log.d(TAG, "dropped event $name: ${t.message}")
    }
  }

  // -------------------------------------------------------------- lifecycle

  @ReactMethod
  fun initializeEngine(options: String, promise: Promise) {
    withEngine(promise) { engine ->
      RnConvert.engineStatus(engine.initialize(parseJsonObject(options)))
    }
  }

  @ReactMethod
  fun shutdownEngine(promise: Promise) {
    val engine = TorrentEngine.peek()
    if (engine == null) {
      promise.resolve(true)
      return
    }
    withEngine(promise) { it.shutdown(); true }
  }

  @ReactMethod
  fun getEngineStatus(promise: Promise) {
    withEngine(promise) { engine -> RnConvert.engineStatus(engine.currentStatus()) }
  }

  // ---------------------------------------------------------------- torrents

  @ReactMethod
  fun addMagnet(magnetUri: String, options: String, promise: Promise) {
    if (magnetUri.isBlank()) {
      promise.reject(E_INVALID_ARGS, "magnetUri must not be empty")
      return
    }
    withEngine(promise) { engine ->
      RnConvert.summary(engine.addMagnet(magnetUri, parseJsonObject(options)))
    }
  }

  @ReactMethod
  fun addTorrentFile(fileUri: String, options: String, promise: Promise) {
    if (fileUri.isBlank()) {
      promise.reject(E_INVALID_ARGS, "fileUri must not be empty")
      return
    }
    withEngine(promise) { engine ->
      RnConvert.summary(engine.addTorrentFile(fileUri, parseJsonObject(options)))
    }
  }

  @ReactMethod
  fun pauseTorrent(torrentId: String, promise: Promise) {
    requireId(promise, torrentId) { withEngine(promise) { it.pauseTorrent(torrentId.trim().lowercase()) } }
  }

  @ReactMethod
  fun resumeTorrent(torrentId: String, promise: Promise) {
    requireId(promise, torrentId) { withEngine(promise) { it.resumeTorrent(torrentId.trim().lowercase()) } }
  }

  @ReactMethod
  fun removeTorrent(torrentId: String, deleteFiles: Boolean, promise: Promise) {
    requireId(promise, torrentId) {
      withEngine(promise) { it.removeTorrent(torrentId.trim().lowercase(), deleteFiles) }
    }
  }

  @ReactMethod
  fun getTorrentList(promise: Promise) {
    withEngine(promise) { engine -> RnConvert.summaryArray(engine.torrentList()) }
  }

  @ReactMethod
  fun getTorrentDetails(torrentId: String, promise: Promise) {
    requireId(promise, torrentId) {
      withEngine(promise) { RnConvert.details(it.torrentDetails(torrentId.trim().lowercase())) }
    }
  }

  @ReactMethod
  fun startAll(promise: Promise) {
    withEngine(promise) { it.startAll() }
  }

  @ReactMethod
  fun pauseAll(promise: Promise) {
    withEngine(promise) { it.pauseAll() }
  }

  @ReactMethod
  fun moveToTop(torrentId: String, promise: Promise) {
    requireId(promise, torrentId) {
      withEngine(promise) { it.moveToTop(torrentId.trim().lowercase()) }
    }
  }

  @ReactMethod
  fun moveToBottom(torrentId: String, promise: Promise) {
    requireId(promise, torrentId) {
      withEngine(promise) { it.moveToBottom(torrentId.trim().lowercase()) }
    }
  }

  // ------------------------------------------------------------ limits & files

  @ReactMethod
  fun setDownloadLimit(bytesPerSecond: Double, promise: Promise) {
    val value = normalizeRate(promise, bytesPerSecond) ?: return
    withEngine(promise) { it.setDownloadLimit(value) }
  }

  @ReactMethod
  fun setUploadLimit(bytesPerSecond: Double, promise: Promise) {
    val value = normalizeRate(promise, bytesPerSecond) ?: return
    withEngine(promise) { it.setUploadLimit(value) }
  }

  @ReactMethod
  fun setTorrentPriority(torrentId: String, fileId: Double, priority: Double, promise: Promise) {
    if (fileId < 0 || priority < 0 || priority > 7) {
      promise.reject(E_INVALID_ARGS, "priority must be between 0 and 7 and fileId must be >= 0")
      return
    }
    val index = fileId.toInt()
    val prio = priority.toInt()
    requireId(promise, torrentId) {
      withEngine(promise) { it.setFilePriority(torrentId.trim().lowercase(), index, prio) }
    }
  }

  @ReactMethod
  fun setFileSelection(torrentId: String, fileId: Double, selected: Boolean, promise: Promise) {
    if (fileId < 0) {
      promise.reject(E_INVALID_ARGS, "fileId must be >= 0")
      return
    }
    val index = fileId.toInt()
    requireId(promise, torrentId) {
      withEngine(promise) { it.setFileSelection(torrentId.trim().lowercase(), index, selected) }
    }
  }

  @ReactMethod
  fun getDirectoryUri(torrentId: String, promise: Promise) {
    requireId(promise, torrentId) {
      withEngine(promise) { engine ->
        val details = engine.torrentDetails(torrentId.trim().lowercase())
        val dir = File(details.summary.savePath)
        if (!dir.exists()) return@withEngine null
        SafStorage.uriForFile(reactContext, dir)?.toString()
      }
    }
  }

  @ReactMethod
  fun getCompletedHistory(promise: Promise) {
    withEngine(promise) { engine -> RnConvert.historyArray(engine.completedHistory()) }
  }

  @ReactMethod
  fun clearCompletedHistory(deleteFiles: Boolean, promise: Promise) {
    withEngine(promise) { it.clearHistory(deleteFiles) }
  }

  // --------------------------------------------------------------- settings

  @ReactMethod
  fun getSettings(promise: Promise) {
    promise.resolve(settingsMap(prefs.read(reactContext)))
  }

  @ReactMethod
  fun setSettings(json: String, promise: Promise) {
    try {
      val incoming = parseJsonObject(json)
      val current = prefs.read(reactContext)
      val next = current.copy(
        downloadDirectory = incoming.optString("downloadDirectory").ifBlank { current.downloadDirectory },
        downloadDirectoryTreeUri = incoming.optString("downloadDirectoryTreeUri")
          .takeIf { it.isNotBlank() } ?: current.downloadDirectoryTreeUri,
        maxActiveTorrents = incoming.optInt("maxActiveTorrents", current.maxActiveTorrents).coerceIn(1, 20),
        downloadLimitBps = incoming.optInt("downloadLimitBps", current.downloadLimitBps).coerceAtLeast(0),
        uploadLimitBps = incoming.optInt("uploadLimitBps", current.uploadLimitBps).coerceAtLeast(0),
        maxConnections = incoming.optInt("maxConnections", current.maxConnections).coerceIn(10, 2000),
        maxPeersPerTorrent = incoming.optInt("maxPeersPerTorrent", current.maxPeersPerTorrent).coerceIn(2, 500),
        wifiOnly = incoming.optBoolean("wifiOnly", current.wifiOnly),
        chargingOnly = incoming.optBoolean("chargingOnly", current.chargingOnly),
        notificationsEnabled = incoming.optBoolean("notificationsEnabled", current.notificationsEnabled),
        notificationProgress = incoming.optBoolean("notificationProgress", current.notificationProgress),
        autoResumeOnStart = incoming.optBoolean("autoResumeOnStart", current.autoResumeOnStart),
        seedAfterCompletion = incoming.optBoolean("seedAfterCompletion", current.seedAfterCompletion),
        sequentialDownload = incoming.optBoolean("sequentialDownload", current.sequentialDownload),
      )
      prefs.write(next)

      val engine = TorrentEngine.peek()
      if (engine != null && engine.isRunning()) {
        TorrentEngine.submit {
          engine.applySettings(next)
        }
      }
      promise.resolve(settingsMap(next))
    } catch (t: Throwable) {
      promise.reject(E_INVALID_ARGS, t.message ?: "Invalid settings payload", t)
    }
  }

  @ReactMethod
  fun getStorageInfo(promise: Promise) {
    try {
      val settings = prefs.read(reactContext)
      val dir = File(settings.downloadDirectory)
      val usable = if (dir.exists() || dir.mkdirs()) dir else File(reactContext.filesDir, "Downloads")
      val stat = StatFs(usable.absolutePath)
      val map = Arguments.createMap()
      map.putDouble("totalBytes", (stat.blockCountLong * stat.blockSizeLong).toDouble())
      map.putDouble("freeBytes", (stat.availableBlocksLong * stat.blockSizeLong).toDouble())
      map.putString("downloadDirectory", usable.absolutePath)
      map.putBoolean("downloadDirectoryWritable", SafStorage.isWritable(usable.absolutePath))
      promise.resolve(map)
    } catch (t: Throwable) {
      promise.reject(E_STORAGE, t.message ?: "Unable to read storage information", t)
    }
  }

  // -------------------------------------------------------------- pickers

  @ReactMethod
  fun pickTorrentFile(promise: Promise) {
    val activity = currentComponentActivity()
    if (activity == null) {
      promise.reject(E_NO_ACTIVITY, reactContext.getString(R.string.error_no_activity))
      return
    }
    DocumentPicker.pickFile(
      activity,
      arrayOf(
        "application/x-bittorrent",
        "application/x-torrent",
        "application/octet-stream",
        "*/*",
      ),
    ) { uri ->
      if (uri == null) {
        promise.resolve(null)
      } else {
        try {
          reactContext.contentResolver.takePersistableUriPermission(
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION,
          )
        } catch (e: SecurityException) {
          // Not all providers offer persistable grants; a one-shot read still works.
        }
        promise.resolve(uri.toString())
      }
    }
  }

  @ReactMethod
  fun pickDownloadDirectory(promise: Promise) {
    val activity = currentComponentActivity()
    if (activity == null) {
      promise.reject(E_NO_ACTIVITY, reactContext.getString(R.string.error_no_activity))
      return
    }
    DocumentPicker.pickTree(activity) { uri ->
      if (uri == null) {
        promise.resolve(null)
        return@pickTree
      }
      SafStorage.takePersistableReadPermission(reactContext, uri)
      val path = SafStorage.treeUriToPath(reactContext, uri.toString())
      if (path == null) {
        promise.reject(
          E_STORAGE,
          "That folder cannot be used for downloads. Choose a folder on the device's internal storage.",
        )
        return@pickTree
      }
      SafStorage.ensureDirectory(path)
      if (!SafStorage.isWritable(path)) {
        promise.reject(E_STORAGE, "The selected folder is not writable")
        return@pickTree
      }
      val map = Arguments.createMap()
      map.putString("uri", uri.toString())
      map.putString("path", path)
      promise.resolve(map)
    }
  }

  // ---------------------------------------------------------------- files

  @ReactMethod
  fun getFileUri(torrentId: String, fileId: Double, promise: Promise) {
    requireId(promise, torrentId) {
      withEngine(promise) { engine ->
        val details = engine.torrentDetails(torrentId.trim().lowercase())
        val file = details.files.firstOrNull { it.index == fileId.toInt() }
          ?: return@withEngine null
        val absolute = File(details.summary.savePath, file.path)
        if (!absolute.exists()) return@withEngine null
        SafStorage.uriForFile(reactContext, absolute)?.toString()
      }
    }
  }

  @ReactMethod
  fun getFilesForTorrent(torrentId: String, promise: Promise) {
    requireId(promise, torrentId) {
      withEngine(promise) { engine ->
        val details = engine.torrentDetails(torrentId.trim().lowercase())
        val arr = Arguments.createArray()
        details.files.forEach { file ->
          arr.pushString(File(details.summary.savePath, file.path).absolutePath)
        }
        arr
      }
    }
  }

  @ReactMethod
  fun openExternal(uri: String, promise: Promise) {
    try {
      val parsed = Uri.parse(uri)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(parsed, reactContext.contentResolver.getType(parsed) ?: "*/*")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject(E_OPEN_FAILED, "No app can open this file", t)
    }
  }

  @ReactMethod
  fun getOpenSourceLicenses(promise: Promise) {
    try {
      reactContext.assets.open("licenses/licenses.txt").use { stream ->
        promise.resolve(stream.readBytes().toString(Charsets.UTF_8))
      }
    } catch (t: Throwable) {
      promise.resolve(DEFAULT_LICENSES)
    }
  }

  // --------------------------------------------------------------- internals

  private fun currentComponentActivity(): ComponentActivity? {
    val activity = reactContext.currentActivity ?: return null
    return activity as? ComponentActivity
  }

  private inline fun requireId(promise: Promise, torrentId: String?, block: () -> Unit) {
    if (torrentId.isNullOrBlank()) {
      promise.reject(E_INVALID_ARGS, "torrentId must not be empty")
      return
    }
    val normalized = torrentId.trim().lowercase()
    if (!HEX_40.matches(normalized) && !HEX_64.matches(normalized)) {
      promise.reject(E_BAD_ID, "Invalid torrent identifier")
      return
    }
    block()
  }

  private fun normalizeRate(promise: Promise, value: Double): Int? {
    if (value.isNaN() || value < 0) {
      promise.reject(E_INVALID_ARGS, "Rate limit must be a positive number of bytes per second")
      return null
    }
    if (value > Int.MAX_VALUE) {
      promise.reject(E_INVALID_ARGS, "Rate limit is too large")
      return null
    }
    return value.toInt()
  }

  private inline fun <T> withEngine(promise: Promise, crossinline block: (TorrentEngine) -> T) {
    val engine = try {
      TorrentEngine.get(reactContext)
    } catch (t: Throwable) {
      promise.reject(E_ENGINE_INIT, t.message ?: "Unable to create the engine", t)
      return
    }
    try {
      val result = TorrentEngine.submit { block(engine) }
        .get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      when {
        result == null -> promise.resolve(null)
        result is Unit -> promise.resolve(true)
        else -> promise.resolve(result)
      }
    } catch (t: Throwable) {
      rejectFromThrowable(promise, t)
    }
  }

  private fun rejectFromThrowable(promise: Promise, t: Throwable) {
    val cause = (t as? java.util.concurrent.ExecutionException)?.cause ?: t
    if (cause is EngineException) {
      promise.reject(cause.code, cause.message ?: "Engine error", cause)
      return
    }
    if (cause is IllegalArgumentException) {
      promise.reject(E_INVALID_ARGS, cause.message ?: "Invalid argument", cause)
      return
    }
    promise.reject(E_UNKNOWN, cause.message ?: "Unexpected error", cause)
  }

  private fun parseJsonObject(json: String?): org.json.JSONObject {
    if (json.isNullOrBlank()) {
      return org.json.JSONObject()
    }
    return org.json.JSONObject(json)
  }

  private fun settingsMap(settings: AppSettings): com.facebook.react.bridge.WritableMap {
    val map = Arguments.createMap()
    map.putString("downloadDirectory", settings.downloadDirectory)
    if (settings.downloadDirectoryTreeUri == null) {
      map.putNull("downloadDirectoryTreeUri")
    } else {
      map.putString("downloadDirectoryTreeUri", settings.downloadDirectoryTreeUri)
    }
    map.putInt("maxActiveTorrents", settings.maxActiveTorrents)
    map.putInt("downloadLimitBps", settings.downloadLimitBps)
    map.putInt("uploadLimitBps", settings.uploadLimitBps)
    map.putInt("maxConnections", settings.maxConnections)
    map.putInt("maxPeersPerTorrent", settings.maxPeersPerTorrent)
    map.putBoolean("wifiOnly", settings.wifiOnly)
    map.putBoolean("chargingOnly", settings.chargingOnly)
    map.putBoolean("notificationsEnabled", settings.notificationsEnabled)
    map.putBoolean("notificationProgress", settings.notificationProgress)
    map.putBoolean("autoResumeOnStart", settings.autoResumeOnStart)
    map.putBoolean("seedAfterCompletion", settings.seedAfterCompletion)
    map.putBoolean("sequentialDownload", settings.sequentialDownload)
    map.putDouble("totalDownloaded", settings.totalDownloaded.toDouble())
    map.putDouble("totalUploaded", settings.totalUploaded.toDouble())
    return map
  }

  companion object {
    const val NAME = "TorrentModule"
    private const val TAG = "TorrentModule"
    private const val TASK_TIMEOUT_SECONDS = 60L

    private const val E_INVALID_ARGS = "E_INVALID_ARGS"
    private const val E_BAD_ID = "E_BAD_ID"
    private const val E_NO_ACTIVITY = "E_NO_ACTIVITY"
    private const val E_STORAGE = "E_STORAGE"
    private const val E_OPEN_FAILED = "E_OPEN_FAILED"
    private const val E_ENGINE_INIT = "E_ENGINE_INIT"
    private const val E_UNKNOWN = "E_UNKNOWN"

    private val HEX_40 = Regex("^[0-9a-f]{40}$")
    private val HEX_64 = Regex("^[0-9a-f]{64}$")

    private val DEFAULT_LICENSES = """
      Torrently open-source components
      ==================================

      libtorrent4j
      Copyright (c) 2018-2025 Alden Torres
      Licensed under the MIT License.

      libtorrent (Rasterbar)
      Copyright (c) 2003-2020, Arvid Norberg
      Licensed under the 3-Clause BSD License.

      React Native
      Copyright (c) Meta Platforms, Inc. and affiliates.
      Licensed under the MIT License.

      See the project README for the full dependency list.
    """.trimIndent()
  }
}
