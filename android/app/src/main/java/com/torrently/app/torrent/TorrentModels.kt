package com.torrently.app.torrent

enum class TorrentState {
  METADATA,
  QUEUED,
  DOWNLOADING,
  CHECKING,
  STALLED,
  PAUSED,
  SEEDING,
  COMPLETED,
  ERROR;

  fun wireName(): String = name.lowercase()

  companion object {
    fun fromWire(value: String?): TorrentState {
      val normalized = (value ?: "").lowercase()
      return entries.firstOrNull { it.wireName() == normalized } ?: DOWNLOADING
    }
  }
}

data class TorrentFileDto(
  val index: Int,
  val path: String,
  val name: String,
  val size: Long,
  val progress: Float,
  val priority: Int,
  val selected: Boolean,
)

data class TrackerDto(
  val url: String,
  val status: String,
  val peers: Int,
  val nextAnnounceIn: Long,
  val error: String?,
)

data class TorrentSummaryDto(
  val id: String,
  val name: String,
  val state: TorrentState,
  val progress: Float,
  val downloadSpeed: Long,
  val uploadSpeed: Long,
  val totalSize: Long,
  val downloadedSize: Long,
  val uploadedSize: Long,
  val etaSeconds: Long?,
  val seeds: Int,
  val peers: Int,
  val savePath: String,
  val savePathTreeUri: String?,
  val queuePosition: Int,
  val addedAt: Long,
  val completedAt: Long?,
  val hasMetadata: Boolean,
  val finished: Boolean,
  val error: String?,
)

data class TorrentDetailsDto(
  val summary: TorrentSummaryDto,
  val files: List<TorrentFileDto>,
  val trackers: List<TrackerDto>,
  val totalPeersListed: Int,
  val totalSeedsListed: Int,
  val allTimeDownload: Long,
  val allTimeUpload: Long,
  val distributedCopies: Float,
  val pieceCount: Int,
  val pieceLength: Int,
  val currentTracker: String?,
  val addedTime: Long,
  val activeDurationSec: Long,
  val seedingDurationSec: Long,
)

data class EngineStatusDto(
  val initialized: Boolean,
  val running: Boolean,
  val dhtEnabled: Boolean,
  val dhtNodes: Long,
  val downloadSpeed: Long,
  val uploadSpeed: Long,
  val totalDownload: Long,
  val totalUpload: Long,
  val listening: Boolean,
  val externalAddress: String?,
  val activeCount: Int,
  val pausedCount: Int,
  val completedCount: Int,
  val torrentCount: Int,
)

data class HistoryEntryDto(
  val id: String,
  val name: String,
  val totalSize: Long,
  val savePath: String,
  val completedAt: Long,
  val fileCount: Int,
  val inEngine: Boolean,
)

sealed class EngineEvent {
  data class TorrentAdded(val torrent: TorrentSummaryDto) : EngineEvent()

  data class MetadataReceived(val torrent: TorrentSummaryDto) : EngineEvent()

  data class StateChanged(val torrent: TorrentSummaryDto) : EngineEvent()

  data class Progress(val torrents: List<TorrentSummaryDto>) : EngineEvent()

  data class TorrentRemoved(val torrentId: String) : EngineEvent()

  data class TorrentError(val torrentId: String, val message: String, val torrent: TorrentSummaryDto?) :
    EngineEvent()

  data class EngineStatusChanged(val status: EngineStatusDto) : EngineEvent()
}
