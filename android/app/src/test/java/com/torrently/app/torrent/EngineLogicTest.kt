package com.torrently.app.torrent

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EngineLogicTest {

  // ------------------------------------------------------------ argument checks

  @Test
  fun `accepts v1 and v2 info hashes`() {
    val v1 = "a".repeat(40)
    val v2 = "b".repeat(64)
    assertTrue(EngineLogic.isValidTorrentId(v1))
    assertTrue(EngineLogic.isValidTorrentId(v2))
    assertTrue(EngineLogic.isValidTorrentId("  $v1  "))
    assertTrue(EngineLogic.isValidTorrentId(v1.uppercase()))
  }

  @Test
  fun `rejects malformed identifiers`() {
    assertFalse(EngineLogic.isValidTorrentId(null))
    assertFalse(EngineLogic.isValidTorrentId(""))
    assertFalse(EngineLogic.isValidTorrentId("   "))
    assertFalse(EngineLogic.isValidTorrentId("not-a-hash"))
    assertFalse(EngineLogic.isValidTorrentId("a".repeat(39)))
    assertFalse(EngineLogic.isValidTorrentId("z".repeat(40)))
    assertFalse(EngineLogic.isValidTorrentId("magnet:?xt=urn:btih:abc"))
  }

  @Test
  fun `normalizes identifiers to lower case without padding`() {
    val v1 = "ABCDEF0123456789ABCDEF0123456789ABCDEF01"
    assertEquals(v1.lowercase(), EngineLogic.normalizeTorrentId(" $v1 "))
  }

  // ------------------------------------------------------------- speed limits

  @Test
  fun `speed limits are clamped into a safe range`() {
    assertEquals(0, EngineLogic.clampRate(-1))
    assertEquals(0, EngineLogic.clampRate(0))
    assertEquals(1024, EngineLogic.clampRate(1024))
    assertEquals(Int.MAX_VALUE, EngineLogic.clampRate(Int.MAX_VALUE.toLong() * 4))
  }

  @Test
  fun `connection and queue settings are clamped`() {
    assertEquals(1, EngineLogic.clampMaxActive(0))
    assertEquals(20, EngineLogic.clampMaxActive(999))
    assertEquals(7, EngineLogic.clampMaxActive(7))
    assertEquals(10, EngineLogic.clampConnections(1))
    assertEquals(2000, EngineLogic.clampConnections(99999))
    assertEquals(2, EngineLogic.clampPeersPerTorrent(0))
    assertEquals(500, EngineLogic.clampPeersPerTorrent(10000))
  }

  @Test
  fun `file priorities stay within libtorrent range`() {
    assertEquals(0, EngineLogic.normalizeFilePriority(-5))
    assertEquals(0, EngineLogic.normalizeFilePriority(0))
    assertEquals(7, EngineLogic.normalizeFilePriority(7))
    assertEquals(7, EngineLogic.normalizeFilePriority(42))
    assertEquals(4, EngineLogic.priorityForSelection(true))
    assertEquals(0, EngineLogic.priorityForSelection(false))
  }

  // ------------------------------------------------------------------- queue

  private fun items(
    vararg entries: Triple<String, Int, Boolean>,
  ): List<EngineLogic.QueueItem> = entries.map { (id, order, paused) ->
    EngineLogic.QueueItem(
      id = id,
      queueOrder = order,
      addedAt = 1000L + order,
      userPaused = paused,
      finished = false,
    )
  }

  @Test
  fun `only the first maxActive candidates run`() {
    val list = items(Triple("a", 1, false), Triple("b", 2, false), Triple("c", 3, false))
    assertFalse(EngineLogic.shouldQueue("a", list, 2, restricted = false, seedAfterCompletion = true))
    assertFalse(EngineLogic.shouldQueue("b", list, 2, restricted = false, seedAfterCompletion = true))
    assertTrue(EngineLogic.shouldQueue("c", list, 2, restricted = false, seedAfterCompletion = true))
  }

  @Test
  fun `user paused torrents never occupy a slot`() {
    val list = items(Triple("a", 1, true), Triple("b", 2, false), Triple("c", 3, false))
    assertTrue(EngineLogic.shouldQueue("a", list, 1, restricted = false, seedAfterCompletion = true))
    assertFalse(EngineLogic.shouldQueue("b", list, 1, restricted = false, seedAfterCompletion = true))
    assertTrue(EngineLogic.shouldQueue("c", list, 1, restricted = false, seedAfterCompletion = true))
  }

  @Test
  fun `restricted network or battery pauses everything`() {
    val list = items(Triple("a", 1, false))
    assertTrue(EngineLogic.shouldQueue("a", list, 5, restricted = true, seedAfterCompletion = true))
  }

  @Test
  fun `finished torrents keep running only when seeding is enabled`() {
    val finished = listOf(
      EngineLogic.QueueItem("done", 1, 1000L, userPaused = false, finished = true),
    )
    assertTrue(
      EngineLogic.shouldQueue("done", finished, 5, restricted = false, seedAfterCompletion = false),
    )
    assertFalse(
      EngineLogic.shouldQueue("done", finished, 5, restricted = false, seedAfterCompletion = true),
    )
  }

  @Test
  fun `unknown torrent is treated as queued`() {
    assertTrue(EngineLogic.shouldQueue("missing", emptyList(), 3, restricted = false, seedAfterCompletion = true))
  }

  @Test
  fun `reindex assigns contiguous 1-based order`() {
    val map = EngineLogic.reindexedOrders(listOf("x", "y", "z"))
    assertEquals(mapOf("x" to 1, "y" to 2, "z" to 3), map)
  }

  // ------------------------------------------------------- state transitions

  private fun base() = EngineLogic.StateInput(
    hasError = false,
    hasMetadata = true,
    downloadingMetadata = false,
    checking = false,
    finished = false,
    paused = false,
    userPaused = false,
    downloadRate = 1024,
    uploadRate = 0,
    idleForMs = 0,
    stallGraceMs = 20_000,
  )

  @Test
  fun `error wins over every other state`() {
    val state = EngineLogic.deriveState(base().copy(hasError = true, paused = true, finished = true))
    assertEquals(TorrentState.ERROR, state)
  }

  @Test
  fun `metadata state is used before metadata arrives`() {
    val state = EngineLogic.deriveState(base().copy(hasMetadata = false, downloadRate = 0))
    assertEquals(TorrentState.METADATA, state)
    assertEquals(
      TorrentState.METADATA,
      EngineLogic.deriveState(base().copy(downloadingMetadata = true)),
    )
  }

  @Test
  fun `checking precedes pause`() {
    assertEquals(
      TorrentState.CHECKING,
      EngineLogic.deriveState(base().copy(checking = true, paused = true, userPaused = true)),
    )
  }

  @Test
  fun `finished torrents become completed or seeding`() {
    assertEquals(
      TorrentState.COMPLETED,
      EngineLogic.deriveState(base().copy(finished = true, uploadRate = 0)),
    )
    assertEquals(
      TorrentState.SEEDING,
      EngineLogic.deriveState(base().copy(finished = true, uploadRate = 512)),
    )
  }

  @Test
  fun `paused versus queued depends on who paused it`() {
    assertEquals(
      TorrentState.PAUSED,
      EngineLogic.deriveState(base().copy(paused = true, userPaused = true)),
    )
    assertEquals(
      TorrentState.QUEUED,
      EngineLogic.deriveState(base().copy(paused = true, userPaused = false)),
    )
  }

  @Test
  fun `stalled only after the grace period`() {
    assertEquals(
      TorrentState.DOWNLOADING,
      EngineLogic.deriveState(base().copy(downloadRate = 0, idleForMs = 1_000)),
    )
    assertEquals(
      TorrentState.STALLED,
      EngineLogic.deriveState(base().copy(downloadRate = 0, idleForMs = 30_000)),
    )
    assertEquals(
      TorrentState.DOWNLOADING,
      EngineLogic.deriveState(base().copy(downloadRate = 0, idleForMs = 60_000).let {
        it.copy(downloadRate = 10)
      }),
    )
  }

  // -------------------------------------------------------------------- ETA

  @Test
  fun `eta only reported while downloading with a usable rate`() {
    assertNull(EngineLogic.etaSeconds(TorrentState.PAUSED, 1_000_000, 100_000))
    assertNull(EngineLogic.etaSeconds(TorrentState.DOWNLOADING, 1_000_000, 0))
    assertNull(EngineLogic.etaSeconds(TorrentState.DOWNLOADING, 0, 100_000))
    assertEquals(10L, EngineLogic.etaSeconds(TorrentState.DOWNLOADING, 1_000_000, 100_000))
    assertEquals(
      1L,
      EngineLogic.etaSeconds(TorrentState.DOWNLOADING, 10, 1_000_000),
    )
  }
}
