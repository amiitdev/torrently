package com.torrently.app.notifications

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.torrently.app.MainActivity
import com.torrently.app.R
import com.torrently.app.service.TorrentService
import com.torrently.app.settings.AppSettings
import com.torrently.app.torrent.EngineStatusDto
import com.torrently.app.torrent.TorrentSummaryDto

object NotificationHelper {

  const val CHANNEL_ID = "torrently_transfers"
  const val NOTIFICATION_ID = 4210

  private const val ACTION_PAUSE_ALL = "com.torrently.app.action.PAUSE_ALL"
  private const val ACTION_RESUME_ALL = "com.torrently.app.action.RESUME_ALL"
  private const val ACTION_STOP = "com.torrently.app.action.STOP"
  private const val ACTION_OPEN = "com.torrently.app.action.OPEN"

  fun ensureChannel(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val existing = manager.getNotificationChannel(CHANNEL_ID)
      if (existing == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          context.getString(R.string.notification_channel_name),
          NotificationManager.IMPORTANCE_LOW,
        ).apply {
          description = context.getString(R.string.notification_channel_description)
          setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
      }
    }
  }

  fun buildNotification(
    context: Context,
    status: EngineStatusDto,
    torrents: List<TorrentSummaryDto>,
    settings: AppSettings,
  ): Notification {
    ensureChannel(context)

    val active = torrents.filter {
      it.state.name == "DOWNLOADING" || it.state.name == "METADATA" ||
        it.state.name == "STALLED" || it.state.name == "CHECKING"
    }
    val inProgress = active.filter { it.state.name != "METADATA" }
    val title = when {
      active.isEmpty() -> context.getString(R.string.notification_title_idle)
      else -> context.getString(R.string.notification_title, active.size)
    }

    val total = inProgress.sumOf { it.totalSize }
    val done = inProgress.sumOf { it.downloadedSize }
    val downloadSpeed = status.downloadSpeed
    val uploadSpeed = status.uploadSpeed

    val text = if (active.isEmpty()) {
      context.getString(R.string.notification_text_idle)
    } else {
      context.getString(
        R.string.notification_text,
        formatSpeed(downloadSpeed),
        formatSpeed(uploadSpeed),
        formatCount(active.size),
      )
    }

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_download)
      .setContentTitle(title)
      .setContentText(text)
      .setColor(0xFFF43F5E.toInt())
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setContentIntent(openAppIntent(context))

    if (settings.notificationProgress && total > 0) {
      val percent = ((done.toDouble() / total) * 100).toInt().coerceIn(0, 100)
      builder.setProgress(100, percent, false)
      builder.setStyle(
        NotificationCompat.BigTextStyle().bigText(
          context.getString(
            R.string.notification_text_progress,
            formatSpeed(downloadSpeed),
            formatSpeed(uploadSpeed),
            percent,
          ),
        ),
      )
    } else {
      builder.setProgress(0, 0, active.isEmpty())
    }

    builder.addAction(0, context.getString(R.string.action_pause_all), pendingAction(context, ACTION_PAUSE_ALL, 1))
    builder.addAction(0, context.getString(R.string.action_resume_all), pendingAction(context, ACTION_RESUME_ALL, 2))
    builder.addAction(0, context.getString(R.string.action_stop_all), pendingAction(context, ACTION_STOP, 3))

    return builder.build()
  }

  private fun openAppIntent(context: Context): PendingIntent {
    val intent = Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    return PendingIntent.getActivity(
      context,
      900,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun pendingAction(context: Context, action: String, requestCode: Int): PendingIntent {
    val intent = Intent(context, TorrentService::class.java).apply { this.action = action }
    return PendingIntent.getService(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  fun notify(context: Context, notification: Notification) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    try {
      manager.notify(NOTIFICATION_ID, notification)
    } catch (e: SecurityException) {
      // Notification permission not granted yet; the engine keeps running.
    }
  }

  fun cancel(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(NOTIFICATION_ID)
  }

  private fun formatSpeed(bytesPerSecond: Long): String = formatBytes(bytesPerSecond) + "/s"

  private fun formatBytes(bytes: Long): String {
    if (bytes <= 0) return "0 B"
    val units = arrayOf("B", "KB", "MB", "GB", "TB")
    var value = bytes.toDouble()
    var exp = 0
    while (value >= 1024 && exp < units.size - 1) {
      value /= 1024
      exp++
    }
    val decimals = if (exp == 0) 0 else if (value < 10) 2 else if (value < 100) 1 else 0
    return "%.${decimals}f %s".format(value, units[exp])
  }

  private fun formatCount(count: Int): String = count.toString()
}
