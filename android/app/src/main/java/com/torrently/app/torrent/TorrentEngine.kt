package com.torrently.app.torrent

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.util.Log
import com.torrently.app.database.AppDatabase
import com.torrently.app.database.HistoryEntity
import com.torrently.app.database.TorrentEntity
import com.torrently.app.service.TorrentService
import com.torrently.app.settings.AppContextHolder
import com.torrently.app.settings.AppPreferences
import com.torrently.app.settings.AppSettings
import com.torrently.app.storage.SafStorage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import org.libtorrent4j.AddTorrentParams
import org.libtorrent4j.alerts.Alert
import org.libtorrent4j.AlertListener
import org.libtorrent4j.AnnounceEntry
import org.libtorrent4j.ErrorCode
import org.libtorrent4j.Priority
import org.libtorrent4j.SessionHandle
import org.libtorrent4j.SessionManager
import org.libtorrent4j.SessionParams
import org.libtorrent4j.SettingsPack
import org.libtorrent4j.Sha1Hash
import org.libtorrent4j.InfoHash
import org.libtorrent4j.TorrentFlags
import org.libtorrent4j.TorrentHandle
import org.libtorrent4j.TorrentInfo
import org.libtorrent4j.TorrentStatus
import org.libtorrent4j.Vectors
import org.libtorrent4j.alerts.AddTorrentAlert
import org.libtorrent4j.alerts.FileErrorAlert
import org.libtorrent4j.alerts.MetadataReceivedAlert
import org.libtorrent4j.alerts.SaveResumeDataAlert
import org.libtorrent4j.alerts.TorrentAlert
import org.libtorrent4j.alerts.TorrentErrorAlert
import org.libtorrent4j.alerts.TorrentFinishedAlert
import org.libtorrent4j.alerts.TorrentPausedAlert
import org.libtorrent4j.alerts.TorrentResumedAlert
import org.libtorrent4j.swig.error_code
import org.libtorrent4j.swig.libtorrent as swigLibtorrent
import org.libtorrent4j.swig.remove_flags_t
import org.libtorrent4j.swig.settings_pack
import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class EngineException(val code: String, message: String, cause: Throwable? = null) :
  Exception(message, cause)

/**
 * Native BitTorrent engine wrapper around libtorrent (via libtorrent4j).
 *
 * The engine owns a dedicated single-threaded executor and a 1 Hz tick. It is
 * fully independent of React Native: downloads keep running when no screen
 * (or no JS runtime at all) is alive, and native state is the source of truth.
 */
class TorrentEngine private constructor(appContext: Context) {

  private val appContext = appContext.applicationContext
  private val prefs = AppPreferences(this.appContext)
  private val db = AppDatabase.get(this.appContext)
  private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  private val engineExecutor = Executors.newSingleThreadExecutor { r ->
    Thread(r, "torrently-engine").apply { isDaemon = true }
  }
  private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { r ->
    Thread(r, "torrently-ticker").apply { isDaemon = true }
  }

  private val sessionManager = SessionManager()
  @Volatile private var sessionHandle: SessionHandle? = null
  @Volatile private var running = false
  private val initialized = AtomicBoolean(false)

  private val lock = Any()
  private val records = LinkedHashMap<String, TorrentEntity>()
  private val cachedSummaries = LinkedHashMap<String, TorrentSummaryDto>()
  private val lastStallMark = HashMap<String, Long>()

  @Volatile private var settings: AppSettings = prefs.read(this.appContext)
  @Volatile private var networkUnmetered = true
  @Volatile private var charging = false

  private var lastProgressEmit = 0L
  private var lastDbFlush = 0L
  private var lastStatusEmit = 0L
  private var lastResumeSave = 0L

  private val alertListener = object : AlertListener {
    override fun types(): IntArray? = null

    override fun alert(a: Alert<*>) {
      try {
        when (a) {
          is AddTorrentAlert -> onAddTorrent(a)
          is MetadataReceivedAlert -> onMetadataReceived(a)
          is TorrentFinishedAlert -> onTorrentFinished(a)
          is TorrentErrorAlert -> onTorrentError(a, a.error().message)
          is FileErrorAlert -> onTorrentError(a, a.message())
          is SaveResumeDataAlert -> onSaveResumeData(a)
          is TorrentPausedAlert -> onSimpleStateChange(a)
          is TorrentResumedAlert -> onSimpleStateChange(a)
          else -> Unit
        }
      } catch (t: Throwable) {
        Log.w(TAG, "alert handling failed", t)
      }
    }
  }

  // ---------------------------------------------------------------- lifecycle

  @Synchronized
  fun initialize(optionOverrides: JSONObject): EngineStatusDto {
    if (running) {
      return currentStatus()
    }

    if (optionOverrides.has("maxActiveTorrents")) {
      settings = settings.copy(maxActiveTorrents = EngineLogic.clampMaxActive(optionOverrides.optInt("maxActiveTorrents")))
    }
    if (optionOverrides.has("downloadRateLimit")) {
      settings = settings.copy(downloadLimitBps = optionOverrides.optInt("downloadRateLimit").coerceAtLeast(0))
    }
    if (optionOverrides.has("uploadRateLimit")) {
      settings = settings.copy(uploadLimitBps = optionOverrides.optInt("uploadRateLimit").coerceAtLeast(0))
    }
    if (optionOverrides.has("maxConnections")) {
      settings = settings.copy(maxConnections = EngineLogic.clampConnections(optionOverrides.optInt("maxConnections")))
    }
    if (optionOverrides.has("maxPeers")) {
      settings = settings.copy(maxPeersPerTorrent = EngineLogic.clampPeersPerTorrent(optionOverrides.optInt("maxPeers")))
    }
    prefs.write(settings)

    val downloadDir = ensureDownloadDirectory()

    if (!initialized.compareAndSet(false, true)) {
      return currentStatus()
    }

    try {
      sessionManager.start(buildSessionParams())
      sessionHandle = SessionHandle(sessionManager.swig())
      sessionManager.addListener(alertListener)
      running = true

      sessionManager.downloadRateLimit(settings.downloadLimitBps)
      sessionManager.uploadRateLimit(settings.uploadLimitBps)

      startNetworkMonitor()
      restoreTorrents(downloadDir)

      scheduler.scheduleWithFixedDelay(
        { safeTick() },
        TICK_INITIAL_DELAY_MS,
        TICK_INTERVAL_MS,
        TimeUnit.MILLISECONDS,
      )

      TorrentService.start(appContext)
      EngineEventBus.emit(EngineEvent.EngineStatusChanged(currentStatus()))
      return currentStatus()
    } catch (t: Throwable) {
      initialized.set(false)
      running = false
      Log.e(TAG, "engine initialization failed", t)
      throw EngineException("E_ENGINE_INIT", t.message ?: "Unable to start the torrent engine", t)
    }
  }

  fun currentStatus(): EngineStatusDto {
    val snapshot = synchronized(lock) { ArrayList(cachedSummaries.values) }
    val active = snapshot.count {
      it.state == TorrentState.DOWNLOADING || it.state == TorrentState.METADATA ||
        it.state == TorrentState.STALLED || it.state == TorrentState.CHECKING
    }
    val paused = snapshot.count { it.state == TorrentState.PAUSED || it.state == TorrentState.QUEUED }
    val completed = snapshot.count { it.finished }

    return EngineStatusDto(
      initialized = initialized.get(),
      running = running,
      dhtEnabled = running && sessionManager.isDhtRunning,
      dhtNodes = if (running) sessionManager.dhtNodes() else 0L,
      downloadSpeed = if (running) sessionManager.downloadRate() else 0L,
      uploadSpeed = if (running) sessionManager.uploadRate() else 0L,
      totalDownload = if (running) sessionManager.totalDownload() else 0L,
      totalUpload = if (running) sessionManager.totalUpload() else 0L,
      listening = running && (sessionHandle?.isListening ?: false),
      externalAddress = if (running) sessionManager.externalAddress() else null,
      activeCount = active,
      pausedCount = paused,
      completedCount = completed,
      torrentCount = snapshot.size,
    )
  }

  fun shutdown() {
    if (!initialized.compareAndSet(true, false)) {
      return
    }
    running = false
    stopNetworkMonitor()
    try {
      sessionManager.removeListener(alertListener)
      requestResumeData(synchronized(lock) { records.keys.toList() })
      Thread.sleep(700)
      saveSessionState()
    } catch (t: Throwable) {
      Log.w(TAG, "error while saving state during shutdown", t)
    }
    scheduler.shutdownNow()
    try {
      sessionManager.stop()
    } catch (t: Throwable) {
      Log.w(TAG, "session stop failed", t)
    }
    sessionHandle = null
    synchronized(lock) { cachedSummaries.clear() }
    TorrentService.stop(appContext)
    EngineEventBus.emit(EngineEvent.EngineStatusChanged(currentStatus()))
  }

  // ------------------------------------------------------------------- adding

  fun addMagnet(magnetUri: String, options: JSONObject): TorrentSummaryDto {
    ensureRunning()
    val trimmed = magnetUri.trim()
    if (!trimmed.startsWith("magnet:", ignoreCase = true)) {
      throw EngineException("E_INVALID_MAGNET", "Not a magnet URI")
    }
    val params = try {
      AddTorrentParams.parseMagnetUri(trimmed)
    } catch (e: IllegalArgumentException) {
      throw EngineException("E_INVALID_MAGNET", e.message ?: "Malformed magnet URI", e)
    } catch (t: Throwable) {
      throw EngineException("E_INVALID_MAGNET", "Malformed magnet URI", t)
    }

    val infoHash = try {
      idFromInfoHashes(params.infoHashes)
    } catch (t: Throwable) {
      ""
    }
    if (infoHash.isBlank() || infoHash.all { it == '0' }) {
      throw EngineException("E_INVALID_MAGNET", "Magnet URI has no usable info-hash")
    }

    return addPrepared(params, infoHash, "magnet", trimmed, options, null)
  }

  fun addTorrentFile(fileUri: String, options: JSONObject): TorrentSummaryDto {
    ensureRunning()
    val parsed = try {
      android.net.Uri.parse(fileUri)
    } catch (t: Throwable) {
      throw EngineException("E_BAD_URI", "Invalid document reference")
    }
    val bytes = SafStorage.readUriBytes(appContext, parsed)
      ?: throw EngineException("E_READ_FAILED", "Unable to read the selected .torrent file")
    if (bytes.isEmpty()) {
      throw EngineException("E_INVALID_TORRENT", "The selected file is empty")
    }

    val torrentInfo = try {
      TorrentInfo(bytes)
    } catch (t: Throwable) {
      throw EngineException("E_INVALID_TORRENT", "Not a valid .torrent file", t)
    }
    if (!torrentInfo.isValid) {
      throw EngineException("E_INVALID_TORRENT", "Not a valid .torrent file")
    }

    val id = idFromInfoHashes(torrentInfo.infoHashes())
    val params = AddTorrentParams()
    params.torrentInfo = torrentInfo

    val copy = File(torrentMetadataDir(), "$id.torrent")
    try {
      copy.parentFile?.mkdirs()
      copy.writeBytes(bytes)
    } catch (t: Throwable) {
      Log.w(TAG, "could not persist torrent metadata copy", t)
    }

    return addPrepared(params, id, "file", copy.absolutePath, options, torrentInfo)
  }

  private fun addPrepared(
    params: AddTorrentParams,
    id: String,
    sourceType: String,
    sourceValue: String,
    options: JSONObject,
    torrentInfo: TorrentInfo?,
  ): TorrentSummaryDto {
    synchronized(lock) {
      if (records.containsKey(id) || cachedSummaries.containsKey(id)) {
        throw EngineException("E_DUPLICATE", "This torrent is already in the list")
      }
    }

    val treeUri = options.optString("savePathTreeUri").takeIf { it.isNotBlank() }
    val requestedPath = options.optString("savePath").ifBlank {
      treeUri?.let { SafStorage.treeUriToPath(appContext, it) ?: "" }.orEmpty()
    }
    val savePath = if (requestedPath.isNotBlank()) requestedPath else settings.downloadDirectory

    SafStorage.ensureDirectory(savePath)
    if (!SafStorage.isWritable(savePath)) {
      val fallback = ensureDownloadDirectory()
      if (fallback == savePath) {
        throw EngineException(
          "E_STORAGE",
          "The download location is not writable. Choose another folder in Settings.",
        )
      }
      Log.w(TAG, "save path not writable, falling back to $fallback")
    }

    params.savePath = savePath
    if (params.name.isNullOrBlank()) {
      params.name = torrentInfo?.name() ?: id
    }

    val startPaused = options.optBoolean("paused", false)
    params.maxConnections = settings.maxPeersPerTorrent
    var newFlags = params.flags.and_(TorrentFlags.AUTO_MANAGED.inv())
    if (settings.sequentialDownload) {
      newFlags = newFlags.or_(TorrentFlags.SEQUENTIAL_DOWNLOAD)
    }
    if (startPaused) {
      newFlags = newFlags.or_(TorrentFlags.PAUSED)
    }
    params.flags = newFlags

    val priorities = options.optJSONArray("filePriorities")
    if (priorities != null && torrentInfo != null && priorities.length() == torrentInfo.numFiles()) {
      params.filePriorities(Array(torrentInfo.numFiles()) { Priority.fromSwig(priorities.getInt(it)) })
    }

    val handle = try {
      addInternal(params, id)
    } catch (e: EngineException) {
      throw e
    } catch (t: Throwable) {
      throw EngineException("E_ADD_FAILED", t.message ?: "Unable to add the torrent", t)
    }

    val now = System.currentTimeMillis()
    val queueOrder = synchronized(lock) {
      (records.values.maxOfOrNull { it.queueOrder } ?: 0) + 1
    }

    val entity = TorrentEntity(
      id = id,
      name = params.name ?: id,
      savePath = savePath,
      savePathTreeUri = treeUri,
      sourceType = sourceType,
      sourceValue = sourceValue,
      addedAt = now,
      completedAt = null,
      queueOrder = queueOrder,
      userPaused = startPaused,
      finished = false,
      totalSize = torrentInfo?.totalSize() ?: 0L,
      progress = 0f,
      state = (if (startPaused) TorrentState.PAUSED else TorrentState.QUEUED).wireName(),
      error = null,
      filePriorities = prioritiesToJson(torrentInfo?.numFiles() ?: 0, params),
      sequential = settings.sequentialDownload,
      lastSeenAt = now,
    )

    synchronized(lock) { records[id] = entity }
    persistEntity(entity)

    val summary = summarize(id, entity, handle)
    synchronized(lock) { cachedSummaries[id] = summary }
    EngineEventBus.emit(EngineEvent.TorrentAdded(summary))
    applyQueueSlots()
    updateServiceNotification()
    return summary
  }

  private fun addInternal(params: AddTorrentParams, id: String): TorrentHandle {
    val session = sessionHandle ?: throw EngineException("E_NOT_RUNNING", "Engine is not running")
    if (findHandle(id) != null) {
      throw EngineException("E_DUPLICATE", "This torrent is already in the list")
    }
    val ec = ErrorCode(error_code())
    val handle = session.addTorrent(params, ec)
    if (ec.isError || !handle.isValid) {
      throw EngineException(
        "E_ADD_FAILED",
        ec.message.ifBlank { "libtorrent rejected the torrent" },
      )
    }
    return handle
  }

  // ----------------------------------------------------------- torrent actions

  fun pauseTorrent(torrentId: String): Boolean {
    ensureRunning()
    val id = requireId(torrentId)
    updateRecord(id) { it.copy(userPaused = true) }
    val handle = findHandle(id)
    if (handle != null && !isPaused(handle)) {
      handle.pause()
    }
    applyQueueSlots()
    emitSingle(id)
    return true
  }

  fun resumeTorrent(torrentId: String): Boolean {
    ensureRunning()
    val id = requireId(torrentId)
    updateRecord(id) { it.copy(userPaused = false) }
    applyQueueSlots()
    emitSingle(id)
    return true
  }

  fun removeTorrent(torrentId: String, deleteFiles: Boolean): Boolean {
    val id = requireId(torrentId)
    val record = synchronized(lock) { records[id] }

    if (record == null) {
      if (deleteFiles) {
        coroutineScope.launch { db.historyDao().delete(id) }
      }
      return false
    }

    if (running) {
      val handle = findHandle(id)
      if (handle != null && handle.isValid) {
        val flags = if (deleteFiles) SessionHandle.DELETE_FILES else remove_flags_t()
        try {
          sessionManager.remove(handle, flags)
        } catch (t: Throwable) {
          Log.w(TAG, "remove_torrent failed", t)
        }
      } else if (deleteFiles) {
        deleteFilesOnDisk(record)
      }
    } else if (deleteFiles) {
      deleteFilesOnDisk(record)
    }

    if (!deleteFiles && record.finished) {
      writeHistory(record)
    }

    synchronized(lock) {
      records.remove(id)
      cachedSummaries.remove(id)
      lastStallMark.remove(id)
    }
    coroutineScope.launch {
      try {
        db.torrentDao().delete(id)
        if (deleteFiles) {
          db.historyDao().delete(id)
          deleteResumeFile(id)
        }
      } catch (t: Throwable) {
        Log.w(TAG, "row cleanup failed", t)
      }
    }
    EngineEventBus.emit(EngineEvent.TorrentRemoved(id))
    return true
  }

  fun startAll(): Int {
    ensureRunning()
    var count = 0
    for (id in synchronized(lock) { records.keys.toList() }) {
      val record = synchronized(lock) { records[id] } ?: continue
      if (record.userPaused) {
        updateRecord(id) { it.copy(userPaused = false) }
        count++
      }
    }
    applyQueueSlots()
    refreshAllSummaries()
    return count
  }

  fun pauseAll(): Int {
    ensureRunning()
    var count = 0
    for (id in synchronized(lock) { records.keys.toList() }) {
      val record = synchronized(lock) { records[id] } ?: continue
      if (!record.userPaused) {
        updateRecord(id) { it.copy(userPaused = true) }
        count++
      }
      findHandle(id)?.let { if (!isPaused(it)) it.pause() }
    }
    refreshAllSummaries()
    return count
  }

  fun setDownloadLimit(bytesPerSecond: Int): Boolean {
    ensureRunning()
    val limit = bytesPerSecond.coerceAtLeast(0)
    settings = prefs.update { it.copy(downloadLimitBps = limit) }
    sessionManager.downloadRateLimit(limit)
    return true
  }

  fun setUploadLimit(bytesPerSecond: Int): Boolean {
    ensureRunning()
    val limit = bytesPerSecond.coerceAtLeast(0)
    settings = prefs.update { it.copy(uploadLimitBps = limit) }
    sessionManager.uploadRateLimit(limit)
    return true
  }

  /** Applies a full settings snapshot to the running session. */
  fun applySettings(next: AppSettings) {
    settings = next
    prefs.write(next)
    if (running) {
      try {
        sessionManager.downloadRateLimit(next.downloadLimitBps)
        sessionManager.uploadRateLimit(next.uploadLimitBps)
        val pack = sessionManager.settings()
        pack.connectionsLimit(next.maxConnections)
        sessionManager.applySettings(pack)
      } catch (t: Throwable) {
        Log.w(TAG, "unable to apply session settings", t)
      }
      applyQueueSlots()
      updateServiceNotification()
    }
  }

  fun setFilePriority(torrentId: String, fileId: Int, priority: Int): Boolean {
    ensureRunning()
    val id = requireId(torrentId)
    val handle = findHandle(id) ?: throw EngineException("E_NOT_FOUND", "Torrent not found")
    val fileCount = handle.torrentFile().numFiles()
    if (fileId < 0 || fileId >= fileCount) {
      throw EngineException("E_BAD_FILE_INDEX", "File index out of range")
    }
    handle.filePriority(fileId, Priority.fromSwig(EngineLogic.normalizeFilePriority(priority)))
    persistPriorities(id, handle)
    emitSingle(id)
    return true
  }

  fun setFileSelection(torrentId: String, fileId: Int, selected: Boolean): Boolean {
    val priority = EngineLogic.priorityForSelection(selected)
    return setFilePriority(torrentId, fileId, priority)
  }

  fun moveToTop(torrentId: String): Boolean = moveQueue(torrentId) { it.queuePositionTop() }
  fun moveToBottom(torrentId: String): Boolean = moveQueue(torrentId) { it.queuePositionBottom() }

  private fun moveQueue(torrentId: String, action: (TorrentHandle) -> Unit): Boolean {
    val id = requireId(torrentId)
    val handle = findHandle(id) ?: return false
    action(handle)
    reindexQueue()
    refreshAllSummaries()
    return true
  }

  // ------------------------------------------------------------------- reading

  fun torrentList(): List<TorrentSummaryDto> {
    refreshAllSummaries()
    return synchronized(lock) { ArrayList(cachedSummaries.values) }
  }

  fun torrentDetails(torrentId: String): TorrentDetailsDto {
    val id = requireId(torrentId)
    val record = synchronized(lock) { records[id] }
      ?: throw EngineException("E_NOT_FOUND", "Torrent not found")
    val summary = synchronized(lock) { cachedSummaries[id] } ?: summarize(id, record, null)
    val handle = findHandle(id)

    if (handle == null || !handle.isValid) {
      return TorrentDetailsDto(
        summary = summary,
        files = emptyList(),
        trackers = emptyList(),
        totalPeersListed = 0,
        totalSeedsListed = 0,
        allTimeDownload = 0,
        allTimeUpload = 0,
        distributedCopies = 0f,
        pieceCount = 0,
        pieceLength = 0,
        currentTracker = null,
        addedTime = record.addedAt,
        activeDurationSec = 0,
        seedingDurationSec = 0,
      )
    }

    val status = handle.status(STATUS_FLAGS)

    val files = try {
      val info = handle.torrentFile()
      val progress = handle.fileProgress()
      val priorities = handle.filePriorities()
      val storage = info.files()
      (0 until info.numFiles()).map { index ->
        val size = storage.fileSize(index)
        val done = progress.getOrElse(index) { 0L }
        val prio = priorities.getOrElse(index) { Priority.DEFAULT }.swig().toInt()
        TorrentFileDto(
          index = index,
          path = storage.filePath(index),
          name = storage.fileName(index),
          size = size,
          progress = if (size > 0) (done.toDouble() / size).toFloat().coerceIn(0f, 1f) else 0f,
          priority = prio,
          selected = prio > 0,
        )
      }
    } catch (t: Throwable) {
      Log.w(TAG, "unable to read file list", t)
      emptyList()
    }

    val trackers = try {
      handle.trackers().map { mapTracker(it) }
    } catch (t: Throwable) {
      emptyList()
    }

    val peers = try {
      handle.peerInfo()
    } catch (t: Throwable) {
      emptyList()
    }

    return TorrentDetailsDto(
      summary = summary,
      files = files,
      trackers = trackers,
      totalPeersListed = peers.size,
      totalSeedsListed = peers.count { (it.flags() and PEER_FLAG_SEED) != 0 },
      allTimeDownload = status.allTimeDownload(),
      allTimeUpload = status.allTimeUpload(),
      distributedCopies = status.distributedCopies(),
      pieceCount = status.numPieces(),
      pieceLength = try {
        handle.torrentFile().pieceLength()
      } catch (t: Throwable) {
        0
      },
      currentTracker = status.currentTracker(),
      addedTime = record.addedAt,
      activeDurationSec = status.activeDuration(),
      seedingDurationSec = status.seedingDuration(),
    )
  }

  fun completedHistory(): List<HistoryEntryDto> {
    val engineIds = synchronized(lock) { cachedSummaries.keys.toSet() }
    val rows = try {
      awaitDb { db.historyDao().getAll() }
    } catch (t: Throwable) {
      Log.w(TAG, "history read failed", t)
      emptyList()
    }
    return rows.map { row ->
      HistoryEntryDto(
        id = row.id,
        name = row.name,
        totalSize = row.totalSize,
        savePath = row.savePath,
        completedAt = row.completedAt,
        fileCount = row.fileCount,
        inEngine = engineIds.contains(row.id),
      )
    }
  }

  fun clearHistory(deleteFiles: Boolean): Int {
    val rows = try {
      awaitDb { db.historyDao().getAll() }
    } catch (t: Throwable) {
      Log.w(TAG, "history read failed", t)
      emptyList()
    }
    for (row in rows) {
      if (deleteFiles) {
        val record = synchronized(lock) { records[row.id] }
        if (record != null) {
          removeTorrent(row.id, true)
        } else {
          deleteHistoryFiles(row)
        }
      }
    }
    coroutineScope.launch {
      try {
        db.historyDao().clear()
      } catch (t: Throwable) {
        Log.w(TAG, "history clear failed", t)
      }
    }
    return rows.size
  }

  // ------------------------------------------------------------------- helpers

  private fun ensureRunning() {
    if (!running) {
      throw EngineException("E_NOT_RUNNING", "The torrent engine is not running")
    }
  }

  private fun requireId(torrentId: String): String {
    if (!EngineLogic.isValidTorrentId(torrentId)) {
      throw EngineException("E_BAD_ID", "Invalid torrent identifier")
    }
    return EngineLogic.normalizeTorrentId(torrentId)
  }

  private fun <T> awaitDb(timeoutSeconds: Long = 10, block: suspend () -> T): T {
    val future = CompletableFuture<T>()
    coroutineScope.launch {
      try {
        future.complete(block())
      } catch (t: Throwable) {
        future.completeExceptionally(t)
      }
    }
    return future.get(timeoutSeconds, TimeUnit.SECONDS)
  }


  fun isRunning(): Boolean = running

  /** Stable torrent identifier: prefers the v1 info-hash, falls back to v2. */
  private fun idFromInfoHashes(infoHashes: InfoHash): String {
    try {
      if (infoHashes.hasV1()) {
        val v1 = infoHashes.v1.toHex()
        if (v1.isNotBlank() && !v1.all { it == '0' }) return v1
      }
      val best = infoHashes.best.toHex()
      if (best.isNotBlank() && !best.all { it == '0' }) return best
    } catch (t: Throwable) {
      Log.w(TAG, "info-hash read failed", t)
    }
    return ""
  }

  /** Resolves the stable id for a live torrent handle (metadata may be missing). */
  private fun idOf(handle: TorrentHandle): String {
    try {
      val id = idFromInfoHashes(handle.torrentFile().infoHashes())
      if (id.isNotEmpty()) return id
    } catch (t: Throwable) {
      // metadata not received yet
    }
    try {
      val v1 = handle.infoHash().toHex()
      if (v1.isNotBlank() && !v1.all { it == '0' }) return v1
    } catch (t: Throwable) {
      // ignore
    }
    return try {
      val magnet = handle.makeMagnetUri()
      val xt = magnet.substringAfter("xt=", "")
      when {
        xt.startsWith("urn:btih:", ignoreCase = true) -> xt.removePrefix("urn:btih:").substringBefore('&').lowercase()
        xt.startsWith("urn:btmh:", ignoreCase = true) -> xt.removePrefix("urn:btmh:").substringBefore('&').lowercase()
        else -> ""
      }
    } catch (t: Throwable) {
      ""
    }
  }

  private fun findHandle(id: String): TorrentHandle? {
    val session = sessionHandle ?: return null
    return try {
      session.torrents().firstOrNull { th ->
        try {
          idOf(th) == id
        } catch (t: Throwable) {
          false
        }
      }
    } catch (t: Throwable) {
      Log.w(TAG, "torrent lookup failed for $id", t)
      null
    }
  }

  private fun isPaused(handle: TorrentHandle): Boolean {
    return try {
      handle.flags.and_(TorrentFlags.PAUSED).non_zero()
    } catch (t: Throwable) {
      false
    }
  }

  private fun updateRecord(id: String, transform: (TorrentEntity) -> TorrentEntity) {
    val updated = synchronized(lock) {
      val current = records[id] ?: return
      val next = transform(current)
      records[id] = next
      next
    }
    persistEntity(updated)
  }

  private fun persistEntity(entity: TorrentEntity) {
    coroutineScope.launch {
      try {
        db.torrentDao().upsert(entity)
      } catch (t: Throwable) {
        Log.w(TAG, "torrent row write failed", t)
      }
    }
  }

  private fun ensureDownloadDirectory(): String {
    val configured = settings.downloadDirectory
    if (configured.isNotBlank() && SafStorage.isWritable(configured)) {
      return configured
    }
    val fallback = prefs.defaultDownloadDirectory(appContext)
    SafStorage.ensureDirectory(fallback)
    if (settings.downloadDirectory != fallback) {
      settings = prefs.update { it.copy(downloadDirectory = fallback, downloadDirectoryTreeUri = null) }
    }
    return fallback
  }

  private fun buildSessionParams(): SessionParams {
    val pack = SettingsPack()
    pack.downloadRateLimit(settings.downloadLimitBps)
    pack.uploadRateLimit(settings.uploadLimitBps)
    pack.connectionsLimit(settings.maxConnections)
    pack.setEnableDht(true)
    pack.setEnableLsd(true)
    pack.anonymousMode(false)
    pack.alertQueueSize(10000)
    pack.setInteger(settings_pack.int_types.alert_mask.swigValue(), alertMask())

    val saved = sessionStateFile()
    if (saved.exists() && saved.length() > 0) {
      try {
        val params = SessionParams(saved.readBytes())
        params.settings = pack
        return params
      } catch (t: Throwable) {
        Log.w(TAG, "could not restore session state, starting fresh", t)
      }
    }
    return SessionParams(pack)
  }

  private fun alertMask(): Int {
    var mask = Alert.ALL_CATEGORIES
    for (category in listOf(
      Alert.BLOCK_PROGRESS_NOTIFICATION,
      Alert.PIECE_PROGRESS_NOTIFICATION,
      Alert.PEER_LOG_NOTIFICATION,
      Alert.DHT_LOG_NOTIFICATION,
      Alert.SESSION_LOG_NOTIFICATION,
      Alert.TORRENT_LOG_NOTIFICATION,
      Alert.PICKER_LOG_NOTIFICATION,
    )) {
      mask = mask.and_(category.inv())
    }
    return mask.to_int()
  }

  private fun saveSessionState() {
    try {
      val bytes = sessionManager.saveState() ?: return
      val file = sessionStateFile()
      file.parentFile?.mkdirs()
      file.writeBytes(bytes)
    } catch (t: Throwable) {
      Log.w(TAG, "unable to persist session state", t)
    }
  }

  // ------------------------------------------------------------------ restore

  private fun restoreTorrents(downloadDir: String) {
    val rows = try {
      awaitDb { db.torrentDao().getAll() }
    } catch (t: Throwable) {
      Log.e(TAG, "unable to load torrent records", t)
      emptyList()
    }

    synchronized(lock) {
      records.clear()
      cachedSummaries.clear()
      rows.forEach { records[it.id] = it }
    }

    for (row in rows) {
      try {
        restoreOne(row, downloadDir)
      } catch (t: Throwable) {
        Log.w(TAG, "failed restoring ${row.id}", t)
        updateRecord(row.id) { it.copy(error = t.message ?: "Restore failed") }
      }
    }
    refreshAllSummaries()
  }

  private fun restoreOne(row: TorrentEntity, downloadDir: String) {
    val session = sessionHandle ?: return
    if (findHandle(row.id) != null) return

    val savePath = row.savePath.ifBlank { downloadDir }.let {
      if (SafStorage.isWritable(it)) it else downloadDir
    }

    var params: AddTorrentParams? = null
    val resumeFile = File(resumeDir(), "${row.id}.resume")
    if (resumeFile.exists() && resumeFile.length() > 0) {
      try {
        val ec = error_code()
        val raw = swigLibtorrent.read_resume_data_ex(
          Vectors.bytes2byte_vector(resumeFile.readBytes()),
          ec,
        )
        if (ec.value() == 0 && raw != null) {
          params = AddTorrentParams(raw)
        }
      } catch (t: Throwable) {
        Log.w(TAG, "resume data unreadable for ${row.id}", t)
      }
    }

    if (params == null) {
      params = when (row.sourceType) {
        "magnet" -> try {
          AddTorrentParams.parseMagnetUri(row.sourceValue)
        } catch (t: Throwable) {
          Log.w(TAG, "source magnet unusable for ${row.id}", t)
          return
        }
        "file" -> {
          val file = File(row.sourceValue)
          if (!file.exists()) return
          try {
            val p = AddTorrentParams()
            p.torrentInfo = TorrentInfo(file.readBytes())
            p
          } catch (t: Throwable) {
            Log.w(TAG, "source torrent unusable for ${row.id}", t)
            return
          }
        }
        else -> return
      }
    }

    params.savePath = savePath
    var flags = params.flags.and_(TorrentFlags.AUTO_MANAGED.inv())
    if (row.userPaused) flags = flags.or_(TorrentFlags.PAUSED)
    params.flags = flags

    if (row.filePriorities.isNotBlank() && row.filePriorities != "[]") {
      try {
        val arr = JSONArray(row.filePriorities)
        val count = params.torrentInfo?.numFiles() ?: 0
        if (count > 0 && arr.length() == count) {
          params.filePriorities(Array(count) { Priority.fromSwig(arr.getInt(it)) })
        }
      } catch (t: Throwable) {
        Log.w(TAG, "could not restore file priorities for ${row.id}", t)
      }
    }

    val ec = ErrorCode(error_code())
    val handle = session.addTorrent(params, ec)
    if (ec.isError || !handle.isValid) {
      throw EngineException("E_RESTORE", ec.message.ifBlank { "Unable to restore torrent" })
    }
    if (row.sequential) {
      handle.setFlags(TorrentFlags.SEQUENTIAL_DOWNLOAD)
    }
  }

  // ------------------------------------------------------------- alert handlers

  private fun onAddTorrent(alert: AddTorrentAlert) {
    val id = try {
      idOf(alert.handle())
    } catch (t: Throwable) {
      return
    }
    val ec = alert.error()
    if (ec.isError) {
      EngineEventBus.emit(EngineEvent.TorrentError(id, ec.message, null))
      return
    }
    if (synchronized(lock) { cachedSummaries.containsKey(id) }) return
    val summary = emitSingle(id) ?: return
    EngineEventBus.emit(EngineEvent.TorrentAdded(summary))
  }

  private fun onMetadataReceived(alert: MetadataReceivedAlert) {
    val id = try {
      idOf(alert.handle())
    } catch (t: Throwable) {
      return
    }
    val summary = emitSingle(id) ?: return
    updateRecord(id) {
      it.copy(name = summary.name, totalSize = summary.totalSize, error = null)
    }
    EngineEventBus.emit(EngineEvent.MetadataReceived(summary))
    updateServiceNotification()
  }

  private fun onTorrentFinished(alert: TorrentFinishedAlert) {
    val id = try {
      idOf(alert.handle())
    } catch (t: Throwable) {
      return
    }
    val now = System.currentTimeMillis()
    updateRecord(id) {
      it.copy(finished = true, completedAt = now, error = null, state = TorrentState.SEEDING.wireName())
    }
    val summary = emitSingle(id) ?: return
    EngineEventBus.emit(EngineEvent.StateChanged(summary))
    captureHistory(id, summary)
    requestResumeData(listOf(id))
    updateServiceNotification()
  }

  private fun onTorrentError(alert: TorrentAlert<*>, message: String) {
    val id = try {
      idOf(alert.handle())
    } catch (t: Throwable) {
      return
    }
    updateRecord(id) { it.copy(error = message, state = TorrentState.ERROR.wireName()) }
    val summary = emitSingle(id)
    EngineEventBus.emit(EngineEvent.TorrentError(id, message, summary))
  }

  private fun onSimpleStateChange(alert: TorrentAlert<*>) {
    val id = try {
      idOf(alert.handle())
    } catch (t: Throwable) {
      return
    }
    val summary = emitSingle(id) ?: return
    EngineEventBus.emit(EngineEvent.StateChanged(summary))
  }

  private fun onSaveResumeData(alert: SaveResumeDataAlert) {
    val id = try {
      idOf(alert.handle())
    } catch (t: Throwable) {
      return
    }
    try {
      val bytes = AddTorrentParams.writeResumeDataBuf(alert.params())
      val file = File(resumeDir(), "$id.resume")
      file.parentFile?.mkdirs()
      file.writeBytes(bytes)
    } catch (t: Throwable) {
      Log.w(TAG, "unable to write resume data for $id", t)
    }
  }

  // ------------------------------------------------------------------ snapshot

  private fun emitSingle(id: String): TorrentSummaryDto? {
    val record = synchronized(lock) { records[id] } ?: return null
    val handle = findHandle(id)
    val summary = summarize(id, record, handle)
    synchronized(lock) { cachedSummaries[id] = summary }
    return summary
  }

  private fun refreshAllSummaries() {
    for (id in synchronized(lock) { records.keys.toList() }) {
      emitSingle(id)
    }
  }

  private fun summarize(id: String, record: TorrentEntity, handle: TorrentHandle?): TorrentSummaryDto {
    if (handle == null || !handle.isValid) {
      return recordSummary(record)
    }
    return try {
      mapStatus(id, handle.status(STATUS_FLAGS), record)
    } catch (t: Throwable) {
      Log.w(TAG, "status read failed for $id", t)
      recordSummary(record)
    }
  }

  private fun recordSummary(record: TorrentEntity): TorrentSummaryDto {
    return TorrentSummaryDto(
      id = record.id,
      name = record.name,
      state = TorrentState.fromWire(record.state),
      progress = record.progress,
      downloadSpeed = 0,
      uploadSpeed = 0,
      totalSize = record.totalSize,
      downloadedSize = (record.totalSize * record.progress).toLong(),
      uploadedSize = 0,
      etaSeconds = null,
      seeds = 0,
      peers = 0,
      savePath = record.savePath,
      savePathTreeUri = record.savePathTreeUri,
      queuePosition = record.queueOrder,
      addedAt = record.addedAt,
      completedAt = record.completedAt,
      hasMetadata = record.totalSize > 0,
      finished = record.finished,
      error = record.error,
    )
  }

  private fun mapStatus(id: String, status: TorrentStatus, record: TorrentEntity): TorrentSummaryDto {
    val paused = try {
      status.flags().and_(TorrentFlags.PAUSED).non_zero()
    } catch (t: Throwable) {
      false
    }

    val state = deriveState(id, status, record, paused)
    val downloadRate = status.downloadPayloadRate().toLong()
    val uploadRate = status.uploadPayloadRate().toLong()

    val eta = EngineLogic.etaSeconds(
      state = state,
      remainingBytes = status.totalWanted() - status.totalWantedDone(),
      downloadRate = downloadRate,
    )

    val completedAt = if (status.isFinished()) {
      record.completedAt ?: System.currentTimeMillis()
    } else {
      null
    }

    return TorrentSummaryDto(
      id = id,
      name = status.name().ifBlank { record.name },
      state = state,
      progress = status.progress(),
      downloadSpeed = downloadRate,
      uploadSpeed = uploadRate,
      totalSize = if (status.total() > 0) status.total() else record.totalSize,
      downloadedSize = status.totalWantedDone(),
      uploadedSize = status.totalPayloadUpload(),
      etaSeconds = eta,
      seeds = status.numSeeds(),
      peers = status.numPeers(),
      savePath = record.savePath,
      savePathTreeUri = record.savePathTreeUri,
      queuePosition = record.queueOrder,
      addedAt = record.addedAt,
      completedAt = completedAt,
      hasMetadata = status.hasMetadata(),
      finished = status.isFinished(),
      error = record.error,
    )
  }

  private fun deriveState(
    id: String,
    status: TorrentStatus,
    record: TorrentEntity,
    paused: Boolean,
  ): TorrentState {
    val now = System.currentTimeMillis()
    val firstIdle = lastStallMark.getOrPut(id) { now }
    if (status.downloadPayloadRate() > 0) {
      lastStallMark.remove(id)
    }

    return EngineLogic.deriveState(
      EngineLogic.StateInput(
        hasError = record.error != null,
        hasMetadata = status.hasMetadata(),
        downloadingMetadata = status.state() == TorrentStatus.State.DOWNLOADING_METADATA,
        checking = status.state() == TorrentStatus.State.CHECKING_FILES ||
          status.state() == TorrentStatus.State.CHECKING_RESUME_DATA,
        finished = status.isFinished(),
        paused = paused,
        userPaused = record.userPaused,
        downloadRate = status.downloadPayloadRate().toLong(),
        uploadRate = status.uploadPayloadRate().toLong(),
        idleForMs = now - firstIdle,
        stallGraceMs = STALL_GRACE_MS,
      ),
    )
  }

  // ------------------------------------------------------------ queue & limits

  private fun shouldQueue(id: String): Boolean {
    val snapshot = synchronized(lock) { records.values.toList() }
    if (snapshot.none { it.id == id }) return true
    val restricted = (settings.wifiOnly && !networkUnmetered) ||
      (settings.chargingOnly && !charging)
    return EngineLogic.shouldQueue(
      id = id,
      items = snapshot.map {
        EngineLogic.QueueItem(
          id = it.id,
          queueOrder = it.queueOrder,
          addedAt = it.addedAt,
          userPaused = it.userPaused,
          finished = it.finished,
        )
      },
      maxActive = settings.maxActiveTorrents,
      restricted = restricted,
      seedAfterCompletion = settings.seedAfterCompletion,
    )
  }

  private fun applyQueueSlots() {
    if (!running) return
    val session = sessionHandle ?: return
    for (id in synchronized(lock) { records.keys.toList() }) {
      val handle = try {
        session.torrents().firstOrNull { th ->
          try {
            idOf(th) == id
          } catch (t: Throwable) {
            false
          }
        }
      } catch (t: Throwable) {
        null
      } ?: continue

      val shouldBeQueued = shouldQueue(id)
      val paused = isPaused(handle)
      try {
        if (shouldBeQueued && !paused) {
          handle.pause()
        } else if (!shouldBeQueued && paused) {
          handle.resume()
        }
      } catch (t: Throwable) {
        Log.w(TAG, "queue transition failed for $id", t)
      }
    }
  }

  private fun reindexQueue() {
    val session = sessionHandle ?: return
    val ordered = try {
      session.torrents().sortedBy { it.queuePosition() }
    } catch (t: Throwable) {
      return
    }
    ordered.forEachIndexed { index, th ->
      val id = idOf(th)
      if (id.isEmpty()) return@forEachIndexed
      updateRecord(id) { it.copy(queueOrder = index + 1) }
    }
  }

  private fun requestResumeData(ids: List<String>) {
    for (id in ids) {
      val handle = findHandle(id) ?: continue
      try {
        if (handle.needSaveResumeData()) {
          handle.saveResumeData(TorrentHandle.SAVE_INFO_DICT)
        }
      } catch (t: Throwable) {
        Log.w(TAG, "save_resume_data request failed for $id", t)
      }
    }
  }

  private fun flushSummary(summary: TorrentSummaryDto) {
    coroutineScope.launch {
      try {
        db.torrentDao().updateProgress(
          id = summary.id,
          name = summary.name,
          totalSize = summary.totalSize,
          progress = summary.progress,
          state = summary.state.wireName(),
          error = summary.error,
          now = System.currentTimeMillis(),
        )
        if (summary.finished) {
          val record = db.torrentDao().getById(summary.id)
          if (record != null && record.completedAt == null) {
            db.torrentDao()
              .setFinished(summary.id, true, summary.completedAt ?: System.currentTimeMillis())
          }
        }
      } catch (t: Throwable) {
        Log.w(TAG, "progress flush failed", t)
      }
    }
  }

  private fun captureHistory(id: String, summary: TorrentSummaryDto) {
    val record = synchronized(lock) { records[id] } ?: return
    writeHistory(record, summary)
  }

  private fun writeHistory(record: TorrentEntity, summary: TorrentSummaryDto? = null) {
    if (!record.finished && summary?.finished != true) {
      return
    }
    val fileCount = try {
      findHandle(record.id)?.torrentFile()?.numFiles() ?: 0
    } catch (t: Throwable) {
      0
    }
    val entity = HistoryEntity(
      id = record.id,
      name = summary?.name ?: record.name,
      totalSize = summary?.totalSize ?: record.totalSize,
      savePath = summary?.savePath ?: record.savePath,
      completedAt = record.completedAt ?: summary?.completedAt ?: System.currentTimeMillis(),
      fileCount = fileCount,
      sourceType = record.sourceType,
      sourceValue = record.sourceValue,
    )
    coroutineScope.launch {
      try {
        db.historyDao().upsert(entity)
      } catch (t: Throwable) {
        Log.w(TAG, "history write failed", t)
      }
    }
  }

  private fun deleteHistoryFiles(row: HistoryEntity) {
    try {
      val root = File(row.savePath, row.name)
      if (root.exists()) SafStorage.deleteRecursively(root)
    } catch (t: Throwable) {
      Log.w(TAG, "file deletion failed", t)
    }
    deleteResumeFile(row.id)
  }

  private fun deleteFilesOnDisk(record: TorrentEntity) {
    try {
      val handle = findHandle(record.id)
      val name = handle?.let {
        try {
          it.torrentFile().name()
        } catch (t: Throwable) {
          record.name
        }
      } ?: record.name
      val root = File(record.savePath, name)
      if (root.exists()) SafStorage.deleteRecursively(root)
    } catch (t: Throwable) {
      Log.w(TAG, "file deletion failed", t)
    }
    deleteResumeFile(record.id)
  }

  private fun deleteResumeFile(id: String) {
    try {
      File(resumeDir(), "$id.resume").delete()
    } catch (t: Throwable) {
      // best effort
    }
  }

  private fun persistPriorities(id: String, handle: TorrentHandle) {
    val json = try {
      val arr = JSONArray()
      handle.filePriorities().forEach { arr.put(it.swig().toInt()) }
      arr.toString()
    } catch (t: Throwable) {
      return
    }
    updateRecord(id) { it.copy(filePriorities = json) }
  }

  private fun prioritiesToJson(count: Int, params: AddTorrentParams): String {
    return try {
      val arr = JSONArray()
      val priorities = params.filePriorities()
      if (priorities != null && priorities.isNotEmpty()) {
        priorities.forEach { arr.put(it.swig().toInt()) }
      } else {
        repeat(count) { arr.put(Priority.DEFAULT.swig().toInt()) }
      }
      arr.toString()
    } catch (t: Throwable) {
      "[]"
    }
  }

  private fun mapTracker(entry: AnnounceEntry): TrackerDto {
    val endpoint = entry.endpoints().firstOrNull()
    val info = endpoint?.infohashV1()
    val status = when {
      info == null -> "idle"
      info.isWorking -> "working"
      info.updating() -> "updating"
      else -> "failed"
    }
    return TrackerDto(
      url = entry.url(),
      status = status,
      peers = 0,
      nextAnnounceIn = 0,
      error = if (status == "failed") info?.message()?.ifBlank { "announce failed" } else null,
    )
  }

  // ------------------------------------------------------------ tick & service

  private fun safeTick() {
    try {
      if (!running) return
      applyQueueSlots()

      val now = System.currentTimeMillis()
      val batch = ArrayList<TorrentSummaryDto>()
      for (id in synchronized(lock) { records.keys.toList() }) {
        val record = synchronized(lock) { records[id] } ?: continue
        val handle = findHandle(id)
        val summary = summarize(id, record, handle)
        synchronized(lock) { cachedSummaries[id] = summary }
        batch.add(summary)
      }

      if (batch.isNotEmpty()) {
        if (now - lastProgressEmit >= PROGRESS_EMIT_INTERVAL_MS) {
          lastProgressEmit = now
          EngineEventBus.emit(EngineEvent.Progress(batch))
        }
        if (now - lastDbFlush >= DB_FLUSH_INTERVAL_MS) {
          lastDbFlush = now
          batch.forEach { flushSummary(it) }
        }
        if (now - lastResumeSave >= RESUME_SAVE_INTERVAL_MS) {
          lastResumeSave = now
          requestResumeData(batch.filter { !it.finished }.map { it.id })
        }
      }

      if (now - lastStatusEmit >= STATUS_EMIT_INTERVAL_MS) {
        lastStatusEmit = now
        EngineEventBus.emit(EngineEvent.EngineStatusChanged(currentStatus()))
        updateServiceNotification()
      }
    } catch (t: Throwable) {
      Log.w(TAG, "tick failed", t)
    }
  }

  private fun updateServiceNotification() {
    try {
      val status = currentStatus()
      val active = synchronized(lock) { ArrayList(cachedSummaries.values) }
      TorrentService.update(appContext, status, active, settings)
    } catch (t: Throwable) {
      Log.w(TAG, "notification update failed", t)
    }
  }

  // --------------------------------------------------------------- constraints

  private var networkCallback: ConnectivityManager.NetworkCallback? = null

  private fun startNetworkMonitor() {
    val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    if (cm != null) {
      val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
          networkUnmetered = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        }

        override fun onLost(network: Network) {
          networkUnmetered = false
        }
      }
      try {
        cm.registerDefaultNetworkCallback(callback)
        networkCallback = callback
        val caps = cm.activeNetwork?.let { cm.getNetworkCapabilities(it) }
        networkUnmetered = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) ?: false
      } catch (t: Throwable) {
        Log.w(TAG, "network monitor unavailable", t)
      }
    }

    val battery = appContext.registerReceiver(
      null,
      IntentFilter(Intent.ACTION_BATTERY_CHANGED),
    )
    if (battery != null) {
      val status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
      val plugged = battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
      charging = plugged || status == BatteryManager.BATTERY_STATUS_CHARGING
    }
  }

  private fun stopNetworkMonitor() {
    val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    val callback = networkCallback
    if (cm != null && callback != null) {
      try {
        cm.unregisterNetworkCallback(callback)
      } catch (t: Throwable) {
        // already unregistered
      }
    }
    networkCallback = null
  }

  // ---------------------------------------------------------------- file paths

  private fun resumeDir(): File = File(appContext.filesDir, "resume").apply { mkdirs() }

  private fun torrentMetadataDir(): File =
    File(appContext.filesDir, "torrents").apply { mkdirs() }

  private fun sessionStateFile(): File = File(appContext.filesDir, "session.state")

  companion object {
    private const val TAG = "TorrentEngine"
    private const val TICK_INTERVAL_MS = 1000L
    private const val TICK_INITIAL_DELAY_MS = 700L
    private const val PROGRESS_EMIT_INTERVAL_MS = 900L
    private const val STATUS_EMIT_INTERVAL_MS = 2000L
    private const val DB_FLUSH_INTERVAL_MS = 5000L
    private const val RESUME_SAVE_INTERVAL_MS = 15000L
    private const val STALL_GRACE_MS = 20000L
    private const val PEER_FLAG_SEED = 0x01

    private val STATUS_FLAGS = TorrentHandle.QUERY_ACCURATE_DOWNLOAD_COUNTERS
      .or_(TorrentHandle.QUERY_PIECES)
      .or_(TorrentHandle.QUERY_DISTRIBUTED_COPIES)
      .or_(TorrentHandle.QUERY_LAST_SEEN_COMPLETE)

    @Volatile
    private var instance: TorrentEngine? = null

    fun get(context: Context): TorrentEngine {
      AppContextHolder.init(context)
      return instance ?: synchronized(this) {
        instance ?: TorrentEngine(context).also { instance = it }
      }
    }

    fun peek(): TorrentEngine? = instance

    fun <T> submit(block: () -> T): java.util.concurrent.Future<T> {
      val engine = instance ?: throw EngineException("E_NOT_RUNNING", "Engine is not initialized")
      return engine.engineExecutor.submit(block)
    }
  }
}
