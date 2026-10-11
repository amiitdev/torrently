package com.torrently.app.bridge

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.torrently.app.torrent.EngineStatusDto
import com.torrently.app.torrent.HistoryEntryDto
import com.torrently.app.torrent.TorrentDetailsDto
import com.torrently.app.torrent.TorrentFileDto
import com.torrently.app.torrent.TorrentSummaryDto
import com.torrently.app.torrent.TrackerDto

/** Converts native DTOs into React Native writable values. */
object RnConvert {

  fun summary(dto: TorrentSummaryDto): WritableMap {
    val map = Arguments.createMap()
    map.putString("id", dto.id)
    map.putString("name", dto.name)
    map.putString("state", dto.state.wireName())
    map.putDouble("progress", dto.progress.toDouble())
    map.putDouble("downloadSpeed", dto.downloadSpeed.toDouble())
    map.putDouble("uploadSpeed", dto.uploadSpeed.toDouble())
    map.putDouble("totalSize", dto.totalSize.toDouble())
    map.putDouble("downloadedSize", dto.downloadedSize.toDouble())
    map.putDouble("uploadedSize", dto.uploadedSize.toDouble())
    if (dto.etaSeconds == null) map.putNull("etaSeconds") else map.putDouble("etaSeconds", dto.etaSeconds!!.toDouble())
    map.putInt("seeds", dto.seeds)
    map.putInt("peers", dto.peers)
    map.putString("savePath", dto.savePath)
    if (dto.savePathTreeUri == null) map.putNull("savePathTreeUri") else map.putString("savePathTreeUri", dto.savePathTreeUri)
    map.putInt("queuePosition", dto.queuePosition)
    map.putDouble("addedAt", dto.addedAt.toDouble())
    if (dto.completedAt == null) map.putNull("completedAt") else map.putDouble("completedAt", dto.completedAt!!.toDouble())
    map.putBoolean("hasMetadata", dto.hasMetadata)
    map.putBoolean("finished", dto.finished)
    if (dto.error == null) map.putNull("error") else map.putString("error", dto.error)
    return map
  }

  fun summaryArray(list: List<TorrentSummaryDto>): WritableArray {
    val arr = Arguments.createArray()
    list.forEach { arr.pushMap(summary(it)) }
    return arr
  }

  fun file(dto: TorrentFileDto): WritableMap {
    val map = Arguments.createMap()
    map.putInt("index", dto.index)
    map.putString("path", dto.path)
    map.putString("name", dto.name)
    map.putDouble("size", dto.size.toDouble())
    map.putDouble("progress", dto.progress.toDouble())
    map.putInt("priority", dto.priority)
    map.putBoolean("selected", dto.selected)
    return map
  }

  fun tracker(dto: TrackerDto): WritableMap {
    val map = Arguments.createMap()
    map.putString("url", dto.url)
    map.putString("status", dto.status)
    map.putInt("peers", dto.peers)
    map.putDouble("nextAnnounceIn", dto.nextAnnounceIn.toDouble())
    if (dto.error == null) map.putNull("error") else map.putString("error", dto.error)
    return map
  }

  fun details(dto: TorrentDetailsDto): WritableMap {
    val map = summary(dto.summary)
    val files = Arguments.createArray()
    dto.files.forEach { files.pushMap(file(it)) }
    map.putArray("files", files)

    val trackers = Arguments.createArray()
    dto.trackers.forEach { trackers.pushMap(tracker(it)) }
    map.putArray("trackers", trackers)

    map.putInt("totalPeersListed", dto.totalPeersListed)
    map.putInt("totalSeedsListed", dto.totalSeedsListed)
    map.putDouble("allTimeDownload", dto.allTimeDownload.toDouble())
    map.putDouble("allTimeUpload", dto.allTimeUpload.toDouble())
    map.putDouble("distributedCopies", dto.distributedCopies.toDouble())
    map.putInt("pieceCount", dto.pieceCount)
    map.putInt("pieceLength", dto.pieceLength)
    if (dto.currentTracker == null) map.putNull("currentTracker") else map.putString("currentTracker", dto.currentTracker)
    map.putDouble("addedTime", dto.addedTime.toDouble())
    map.putDouble("activeDurationSec", dto.activeDurationSec.toDouble())
    map.putDouble("seedingDurationSec", dto.seedingDurationSec.toDouble())
    return map
  }

  fun engineStatus(dto: EngineStatusDto): WritableMap {
    val map = Arguments.createMap()
    map.putBoolean("initialized", dto.initialized)
    map.putBoolean("running", dto.running)
    map.putBoolean("dhtEnabled", dto.dhtEnabled)
    map.putDouble("dhtNodes", dto.dhtNodes.toDouble())
    map.putDouble("downloadSpeed", dto.downloadSpeed.toDouble())
    map.putDouble("uploadSpeed", dto.uploadSpeed.toDouble())
    map.putDouble("totalDownload", dto.totalDownload.toDouble())
    map.putDouble("totalUpload", dto.totalUpload.toDouble())
    map.putBoolean("listening", dto.listening)
    if (dto.externalAddress == null) map.putNull("externalAddress") else map.putString("externalAddress", dto.externalAddress)
    map.putInt("activeCount", dto.activeCount)
    map.putInt("pausedCount", dto.pausedCount)
    map.putInt("completedCount", dto.completedCount)
    map.putInt("torrentCount", dto.torrentCount)
    return map
  }

  fun history(dto: HistoryEntryDto): WritableMap {
    val map = Arguments.createMap()
    map.putString("id", dto.id)
    map.putString("name", dto.name)
    map.putDouble("totalSize", dto.totalSize.toDouble())
    map.putString("savePath", dto.savePath)
    map.putDouble("completedAt", dto.completedAt.toDouble())
    map.putInt("fileCount", dto.fileCount)
    map.putBoolean("inEngine", dto.inEngine)
    return map
  }

  fun historyArray(list: List<HistoryEntryDto>): WritableArray {
    val arr = Arguments.createArray()
    list.forEach { arr.pushMap(history(it)) }
    return arr
  }

}
