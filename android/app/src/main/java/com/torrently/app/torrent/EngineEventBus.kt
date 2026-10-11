package com.torrently.app.torrent

import java.util.concurrent.CopyOnWriteArraySet

/**
 * Process-wide fan-out for engine events.
 *
 * The engine never depends on React Native being alive: it always emits, and the
 * native module registers/unregisters a listener while a React context exists.
 */
object EngineEventBus {

  fun interface Listener {
    fun onEvent(event: EngineEvent)
  }

  private val listeners = CopyOnWriteArraySet<Listener>()

  fun addListener(listener: Listener) {
    listeners.add(listener)
  }

  fun removeListener(listener: Listener) {
    listeners.remove(listener)
  }

  val hasListeners: Boolean
    get() = listeners.isNotEmpty()

  fun emit(event: EngineEvent) {
    if (listeners.isEmpty()) {
      return
    }
    for (listener in listeners) {
      try {
        listener.onEvent(event)
      } catch (t: Throwable) {
        // A misbehaving consumer must never take the engine down.
      }
    }
  }
}
