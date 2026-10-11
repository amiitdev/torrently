package com.torrently.app.torrent

/**
 * Pure, JVM-testable rules for the torrent engine.
 *
 * Keeping these outside [TorrentEngine] means queue behaviour, state
 * transitions and argument validation can be unit-tested without Android,
 * native libtorrent or a running session.
 */
object EngineLogic {

  private val HEX_40 = Regex("^[0-9a-f]{40}$")
  private val HEX_64 = Regex("^[0-9a-f]{64}$")

  /** v1 (SHA-1) and v2 (SHA-256) info-hash identifiers, lower case hex. */
  fun isValidTorrentId(id: String?): Boolean {
    if (id.isNullOrBlank()) return false
    val normalized = id.trim().lowercase()
    return HEX_40.matches(normalized) || HEX_64.matches(normalized)
  }

  fun normalizeTorrentId(id: String): String = id.trim().lowercase()

  fun clampRate(bytesPerSecond: Long): Int {
    if (bytesPerSecond <= 0L) return 0
    if (bytesPerSecond > Int.MAX_VALUE) return Int.MAX_VALUE
    return bytesPerSecond.toInt()
  }

  fun clampMaxActive(value: Int): Int = value.coerceIn(1, 20)
  fun clampConnections(value: Int): Int = value.coerceIn(10, 2000)
  fun clampPeersPerTorrent(value: Int): Int = value.coerceIn(2, 500)

  /** 0 = skip, otherwise a libtorrent file priority (1..7). */
  fun normalizeFilePriority(priority: Int): Int = priority.coerceIn(0, 7)

  /** Selection toggle maps onto ignore / default priority. */
  fun priorityForSelection(selected: Boolean): Int = if (selected) 4 else 0

  data class QueueItem(
    val id: String,
    val queueOrder: Int,
    val addedAt: Long,
    val userPaused: Boolean,
    val finished: Boolean,
  )

  /**
   * Returns true when [id] must wait: either the user paused it, a restriction
   * (Wi-Fi/charging/seed-after-completion) applies, or the active slots are
   * already full for torrents that come first in queue order.
   */
  fun shouldQueue(
    id: String,
    items: List<QueueItem>,
    maxActive: Int,
    restricted: Boolean,
    seedAfterCompletion: Boolean,
  ): Boolean {
    val target = items.firstOrNull { it.id == id } ?: return true
    if (target.userPaused) return true
    if (restricted) return true
    if (target.finished && !seedAfterCompletion) return true
    if (target.finished) return false

    val candidates = items
      .filter { !it.userPaused && !it.finished }
      .sortedWith(compareBy({ it.queueOrder }, { it.addedAt }))
    val position = candidates.indexOfFirst { it.id == id }
    return position < 0 || position >= maxActive.coerceAtLeast(1)
  }

  data class StateInput(
    val hasError: Boolean,
    val hasMetadata: Boolean,
    val downloadingMetadata: Boolean,
    val checking: Boolean,
    val finished: Boolean,
    val paused: Boolean,
    val userPaused: Boolean,
    val downloadRate: Long,
    val uploadRate: Long,
    val idleForMs: Long,
    val stallGraceMs: Long,
  )

  /** Derives the wire state shown in the UI. Order matters. */
  fun deriveState(input: StateInput): TorrentState {
    if (input.hasError) return TorrentState.ERROR
    if (input.hasMetadata && input.checking) return TorrentState.CHECKING
    if (input.finished) {
      return if (input.uploadRate > 0) TorrentState.SEEDING else TorrentState.COMPLETED
    }
    if (!input.hasMetadata || input.downloadingMetadata) return TorrentState.METADATA
    if (input.paused) {
      return if (input.userPaused) TorrentState.PAUSED else TorrentState.QUEUED
    }
    if (input.downloadRate <= 0 && input.idleForMs > input.stallGraceMs) {
      return TorrentState.STALLED
    }
    return TorrentState.DOWNLOADING
  }

  /** ETA in seconds when enough information is available, otherwise null. */
  fun etaSeconds(
    state: TorrentState,
    remainingBytes: Long,
    downloadRate: Long,
  ): Long? {
    if (state != TorrentState.DOWNLOADING || downloadRate <= 0 || remainingBytes <= 0) {
      return null
    }
    return (remainingBytes / downloadRate).coerceAtLeast(1L)
  }

  /** Queue reindexing helper: stable order used after a move to top/bottom. */
  fun reindexedOrders(idsInEngineOrder: List<String>): Map<String, Int> =
    idsInEngineOrder.mapIndexed { index, id -> id to (index + 1) }.toMap()
}
