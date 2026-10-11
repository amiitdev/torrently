package com.torrently.app.storage

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.UriPermission
import android.net.Uri
import android.os.Environment
import android.os.storage.StorageManager
import android.provider.DocumentsContract
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File
import java.io.IOException

/**
 * Storage Access Framework helpers.
 *
 * The BitTorrent engine writes through the regular filesystem, so a picked
 * document tree must be translated back into a real path. That is only possible
 * for volumes that are mounted at a known mount point (primary external storage
 * and SD cards). When translation fails we report it instead of silently
 * downloading into the wrong place.
 */
object SafStorage {

  private const val TAG = "SafStorage"

  fun takePersistableReadPermission(context: Context, uri: Uri) {
    try {
      context.contentResolver.takePersistableUriPermission(
        uri,
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
      )
    } catch (e: SecurityException) {
      Log.w(TAG, "Unable to persist permission for $uri", e)
    }
  }

  fun hasPersistedPermission(context: Context, uri: Uri): Boolean {
    return context.contentResolver.persistedUriPermissions.any {
      it.uri == uri && it.isReadPermission && it.isWritePermission
    }
  }

  fun releasePersistedPermission(context: Context, uri: Uri) {
    try {
      context.contentResolver.releasePersistableUriPermission(
        uri,
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
      )
    } catch (e: SecurityException) {
      Log.w(TAG, "Unable to release permission for $uri", e)
    }
  }

  fun listPersistedTrees(context: Context): List<UriPermission> {
    return context.contentResolver.persistedUriPermissions.filter { it.isWritePermission }
  }

  /**
   * Converts a document tree URI (…/tree/primary%3ADownload) into a filesystem path.
   * Returns null when the volume cannot be mapped to a mount point.
   */
  fun treeUriToPath(context: Context, treeUri: String): String? {
    val uri = Uri.parse(treeUri)
    if (!DocumentsContract.isTreeUri(uri)) {
      return null
    }
    val docId = try {
      DocumentsContract.getTreeDocumentId(uri)
    } catch (e: IllegalArgumentException) {
      return null
    }

    val primaryId = Environment.getExternalStorageDirectory().absolutePath.removePrefix("/storage/")

    if (docId.startsWith("primary:")) {
      val relative = docId.removePrefix("primary:").trimStart('/')
      val root = Environment.getExternalStorageDirectory().absolutePath
      return if (relative.isEmpty()) root else "$root/$relative"
    }

    // External volume ids look like "1A2B-3C4D:Music" or just "1A2B-3C4D".
    val volumeId = docId.substringBefore(':')
    val relative = docId.substringAfter(':', "").trimStart('/')

    val sm = context.getSystemService(Context.STORAGE_SERVICE) as? StorageManager
    if (sm != null) {
      for (volume in sm.storageVolumes) {
        val uuid = volume.uuid ?: continue
        if (uuid.equals(volumeId, ignoreCase = true) || volumeId.equals("sdcard", ignoreCase = true)) {
          val dir = volume.directory ?: continue
          return if (relative.isEmpty()) dir.absolutePath else "${dir.absolutePath}/$relative"
        }
      }
    }

    // Best-effort fallback for volumes that are mounted under /storage/<id>.
    val candidate = File("/storage/$volumeId", relative)
    if (candidate.exists() || File("/storage/$volumeId").exists()) {
      return candidate.absolutePath
    }

    Log.w(TAG, "Unable to map tree document id '$docId' (primary=$primaryId)")
    return null
  }

  fun ensureDirectory(path: String): File {
    val dir = File(path)
    if (!dir.exists()) {
      dir.mkdirs()
    }
    return dir
  }

  fun isWritable(path: String): Boolean {
    return try {
      val dir = ensureDirectory(path)
      val probe = File(dir, ".torrently-write-test")
      probe.writeText("ok")
      probe.delete()
      true
    } catch (e: IOException) {
      false
    } catch (e: SecurityException) {
      false
    }
  }

  fun availableBytes(path: String): Long {
    return try {
      val stat = android.os.StatFs(path)
      stat.availableBlocksLong * stat.blockSizeLong
    } catch (e: IllegalArgumentException) {
      0L
    }
  }

  fun totalBytes(path: String): Long {
    return try {
      val stat = android.os.StatFs(path)
      stat.blockCountLong * stat.blockSizeLong
    } catch (e: IllegalArgumentException) {
      0L
    }
  }

  fun readUriBytes(context: Context, uri: Uri): ByteArray? {
    return try {
      context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
    } catch (e: IOException) {
      Log.e(TAG, "Failed reading $uri", e)
      null
    } catch (e: SecurityException) {
      Log.e(TAG, "No permission reading $uri", e)
      null
    }
  }

  fun fileSize(context: Context, uri: Uri): Long {
    return try {
      context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.SIZE), null, null, null)
        ?.use { cursor ->
          if (cursor.moveToFirst()) {
            val idx = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE)
            if (idx >= 0 && !cursor.isNull(idx)) cursor.getLong(idx) else -1L
          } else {
            -1L
          }
        } ?: -1L
    } catch (e: Exception) {
      -1L
    }
  }

  fun providerAuthority(context: Context): String = "${context.packageName}.fileprovider"

  fun uriForFile(context: Context, file: File): Uri? {
    return try {
      FileProvider.getUriForFile(context, providerAuthority(context), file)
    } catch (e: IllegalArgumentException) {
      Log.w(TAG, "FileProvider rejected ${file.absolutePath}", e)
      null
    }
  }

  fun deleteRecursively(file: File): Boolean {
    if (file.isDirectory) {
      file.listFiles()?.forEach { deleteRecursively(it) }
    }
    return file.delete()
  }

  fun deepFileSize(file: File): Long {
    if (file.isFile) return file.length()
    if (!file.isDirectory) return 0L
    return file.listFiles()?.sumOf { deepFileSize(it) } ?: 0L
  }
}
