package com.torrently.app.database

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Update
import android.content.Context

@Entity(tableName = "torrents")
data class TorrentEntity(
  @PrimaryKey val id: String,
  val name: String,
  val savePath: String,
  val savePathTreeUri: String?,
  val sourceType: String,
  val sourceValue: String,
  val addedAt: Long,
  val completedAt: Long?,
  val queueOrder: Int,
  val userPaused: Boolean,
  val finished: Boolean,
  val totalSize: Long,
  val progress: Float,
  val state: String,
  val error: String?,
  val filePriorities: String,
  val sequential: Boolean,
  val lastSeenAt: Long,
)

@Entity(tableName = "history")
data class HistoryEntity(
  @PrimaryKey val id: String,
  val name: String,
  val totalSize: Long,
  val savePath: String,
  val completedAt: Long,
  val fileCount: Int,
  val sourceType: String,
  val sourceValue: String,
)

@Dao
interface TorrentDao {
  @Query("SELECT * FROM torrents ORDER BY queueOrder ASC, addedAt ASC")
  suspend fun getAll(): List<TorrentEntity>

  @Query("SELECT * FROM torrents WHERE id = :id LIMIT 1")
  suspend fun getById(id: String): TorrentEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsert(entity: TorrentEntity)

  @Update
  suspend fun update(entity: TorrentEntity)

  @Query("DELETE FROM torrents WHERE id = :id")
  suspend fun delete(id: String)

  @Query("DELETE FROM torrents")
  suspend fun clear()

  @Query("SELECT MAX(queueOrder) FROM torrents")
  suspend fun maxQueueOrder(): Int?

  @Query("UPDATE torrents SET userPaused = :paused WHERE id = :id")
  suspend fun setUserPaused(id: String, paused: Boolean)

  @Query("UPDATE torrents SET finished = :finished, completedAt = :completedAt WHERE id = :id")
  suspend fun setFinished(id: String, finished: Boolean, completedAt: Long?)

  @Query(
    "UPDATE torrents SET name = :name, totalSize = :totalSize, progress = :progress, " +
      "state = :state, error = :error, lastSeenAt = :now WHERE id = :id",
  )
  suspend fun updateProgress(
    id: String,
    name: String,
    totalSize: Long,
    progress: Float,
    state: String,
    error: String?,
    now: Long,
  )

  @Query("UPDATE torrents SET queueOrder = :order WHERE id = :id")
  suspend fun setQueueOrder(id: String, order: Int)
}

@Dao
interface HistoryDao {
  @Query("SELECT * FROM history ORDER BY completedAt DESC")
  suspend fun getAll(): List<HistoryEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsert(entity: HistoryEntity)

  @Query("DELETE FROM history WHERE id = :id")
  suspend fun delete(id: String)

  @Query("DELETE FROM history")
  suspend fun clear()

  @Query("SELECT * FROM history WHERE id = :id LIMIT 1")
  suspend fun getById(id: String): HistoryEntity?
}

@Database(entities = [TorrentEntity::class, HistoryEntity::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
  abstract fun torrentDao(): TorrentDao
  abstract fun historyDao(): HistoryDao

  companion object {
    @Volatile
    private var instance: AppDatabase? = null

    fun get(context: Context): AppDatabase {
      return instance ?: synchronized(this) {
        instance ?: Room.databaseBuilder(
          context.applicationContext,
          AppDatabase::class.java,
          "torrently.db",
        )
          .build()
          .also { instance = it }
      }
    }
  }
}
