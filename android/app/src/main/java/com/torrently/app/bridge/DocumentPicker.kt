package com.torrently.app.bridge

import android.net.Uri
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts

/**
 * SAF pickers bound to the current React activity through the
 * [androidx.activity.result.ActivityResultRegistry].
 *
 * Registration happens lazily and at most once per Activity instance so the
 * registry never sees a duplicate key.
 */
object DocumentPicker {

  private const val TAG = "DocumentPicker"
  private const val KEY_FILE = "com.torrently.app.pick.FILE"
  private const val KEY_TREE = "com.torrently.app.pick.TREE"

  private var boundActivity: ComponentActivity? = null
  private var fileLauncher: ActivityResultLauncher<Array<String>>? = null
  private var treeLauncher: ActivityResultLauncher<Uri?>? = null
  private var pendingFile: ((Uri?) -> Unit)? = null
  private var pendingTree: ((Uri?) -> Unit)? = null

  @Synchronized
  fun bind(activity: ComponentActivity) {
    if (boundActivity === activity) {
      return
    }
    boundActivity = activity
    fileLauncher = activity.activityResultRegistry.register(
      KEY_FILE,
      ActivityResultContracts.OpenDocument(),
    ) { uri ->
      val callback = pendingFile
      pendingFile = null
      callback?.invoke(uri)
    }
    treeLauncher = activity.activityResultRegistry.register(
      KEY_TREE,
      ActivityResultContracts.OpenDocumentTree(),
    ) { uri ->
      val callback = pendingTree
      pendingTree = null
      callback?.invoke(uri)
    }
  }

  @Synchronized
  fun pickFile(activity: ComponentActivity, mimeTypes: Array<String>, callback: (Uri?) -> Unit) {
    bind(activity)
    val launcher = fileLauncher
    if (launcher == null) {
      callback(null)
      return
    }
    pendingFile = callback
    try {
      launcher.launch(mimeTypes)
    } catch (t: Throwable) {
      Log.w(TAG, "unable to launch document picker", t)
      pendingFile = callback
      pendingFile = null
      callback(null)
    }
  }

  @Synchronized
  fun pickTree(activity: ComponentActivity, callback: (Uri?) -> Unit) {
    bind(activity)
    val launcher = treeLauncher
    if (launcher == null) {
      callback(null)
      return
    }
    pendingTree = callback
    try {
      launcher.launch(null)
    } catch (t: Throwable) {
      Log.w(TAG, "unable to launch directory picker", t)
      pendingTree = null
      callback(null)
    }
  }

  @Synchronized
  fun onActivityDestroyed(activity: ComponentActivity) {
    if (boundActivity === activity) {
      boundActivity = null
      fileLauncher = null
      treeLauncher = null
      pendingFile = null
      pendingTree = null
    }
  }
}
