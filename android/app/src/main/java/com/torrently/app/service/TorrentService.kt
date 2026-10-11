package com.torrently.app.service

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.content.ContextCompat
import com.torrently.app.notifications.NotificationHelper
import com.torrently.app.settings.AppSettings
import com.torrently.app.torrent.EngineEventBus
import com.torrently.app.torrent.EngineEvent
import com.torrently.app.torrent.EngineStatusDto
import com.torrently.app.torrent.TorrentEngine
import com.torrently.app.torrent.TorrentSummaryDto

/**
 * Foreground service that keeps user-initiated transfers visible (and eligible
 * for background execution) while the app is not on screen.
 *
 * The engine itself is not owned by this service — the service is only a
 * lifecycle/notification host. Killing the UI never stops the transfers.
 */
class TorrentService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = NotificationHelper.buildNotification(
      this,
      lastStatus,
      lastTorrents,
      lastSettings,
    )
    startForeground(NotificationHelper.NOTIFICATION_ID, notification)

    when (intent?.action) {
      ACTION_PAUSE_ALL -> runEngine { it.pauseAll() }
      ACTION_RESUME_ALL -> runEngine { it.startAll() }
      ACTION_STOP_ALL -> {
        runEngine { it.pauseAll() }
        stopSelf()
      }
      else -> Unit
    }

    // Re-post with fresh data right away.
    postUpdate(lastStatus, lastTorrents, lastSettings)
    return START_STICKY
  }

  override fun onDestroy() {
    NotificationHelper.cancel(this)
    super.onDestroy()
  }

  private fun runEngine(block: (TorrentEngine) -> Unit) {
    val engine = TorrentEngine.peek() ?: return
    try {
      TorrentEngine.submit { block(engine) }
    } catch (t: Throwable) {
      Log.w(TAG, "service action failed", t)
    }
  }

  private fun postUpdate(status: EngineStatusDto, torrents: List<TorrentSummaryDto>, settings: AppSettings) {
    lastStatus = status
    lastTorrents = torrents
    lastSettings = settings
    if (!settings.notificationsEnabled) return
    NotificationHelper.notify(this, NotificationHelper.buildNotification(this, status, torrents, settings))
  }

  companion object {
    private const val TAG = "TorrentService"
    const val ACTION_PAUSE_ALL = "com.torrently.app.action.PAUSE_ALL"
    const val ACTION_RESUME_ALL = "com.torrently.app.action.RESUME_ALL"
    const val ACTION_STOP_ALL = "com.torrently.app.action.STOP"

    @Volatile private var lastStatus = EngineStatusDto(
      initialized = false,
      running = false,
      dhtEnabled = false,
      dhtNodes = 0,
      downloadSpeed = 0,
      uploadSpeed = 0,
      totalDownload = 0,
      totalUpload = 0,
      listening = false,
      externalAddress = null,
      activeCount = 0,
      pausedCount = 0,
      completedCount = 0,
      torrentCount = 0,
    )

    @Volatile private var lastTorrents: List<TorrentSummaryDto> = emptyList()
    @Volatile private var lastSettings = AppSettings(
      downloadDirectory = "",
      downloadDirectoryTreeUri = null,
      maxActiveTorrents = 3,
      downloadLimitBps = 0,
      uploadLimitBps = 0,
      maxConnections = 200,
      maxPeersPerTorrent = 60,
      wifiOnly = false,
      chargingOnly = false,
      notificationsEnabled = true,
      notificationProgress = true,
      autoResumeOnStart = true,
      seedAfterCompletion = true,
      sequentialDownload = false,
      totalDownloaded = 0,
      totalUploaded = 0,
    )

    @Volatile private var running = false

    fun start(context: Context) {
      if (running) return
      running = true
      try {
        NotificationHelper.ensureChannel(context)
        val intent = Intent(context, TorrentService::class.java)
        ContextCompat.startForegroundService(context, intent)
      } catch (t: Throwable) {
        running = false
        Log.w(TAG, "unable to start foreground service", t)
      }
    }

    fun stop(context: Context) {
      running = false
      try {
        context.stopService(Intent(context, TorrentService::class.java))
      } catch (t: Throwable) {
        Log.w(TAG, "unable to stop foreground service", t)
      }
      NotificationHelper.cancel(context)
    }

    fun update(
      context: Context,
      status: EngineStatusDto,
      torrents: List<TorrentSummaryDto>,
      settings: AppSettings,
    ) {
      lastStatus = status
      lastTorrents = torrents
      lastSettings = settings
      if (!settings.notificationsEnabled) {
        NotificationHelper.cancel(context)
        return
      }
      if (!running) {
        start(context)
      }
      NotificationHelper.notify(
        context,
        NotificationHelper.buildNotification(context, status, torrents, settings),
      )
    }
  }
}
