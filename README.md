<div align="center">

# 🌹 Torrently

**A premium dark-themed BitTorrent client for Android**

[![React Native](https://img.shields.io/badge/React%20Native-0.87-blue?logo=react)](https://reactnative.dev)
[![Kotlin](https://img.shields.io/badge/Kotlin-2.2-purple?logo=kotlin)](https://kotlinlang.org)
[![libtorrent](https://img.shields.io/badge/engine-libtorrent%202.1-green)](https://www.libtorrent.org)
[![License](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

*Real BitTorrent engine. Beautiful UI. No nonsense.*

[Features](#-features) · [How It Works](#-how-it-works) · [Tech Stack](#-tech-stack) · [Run It](#-run-it) · [Build APK](#-build-the-apk) · [Screenshots](#-screens)

</div>

---

## ✨ Features

| Feature | Details |
|---------|---------|
| 🌐 **Real BitTorrent** | Powered by **libtorrent** (the same C++ engine behind qBittorrent & Transmission) |
| 🧲 **Magnet + .torrent** | Open magnet links from browsers, or pick `.torrent` files |
| 📱 **Background downloads** | Foreground service keeps downloading even when the app is minimized |
| 🔔 **Live notifications** | Ongoing notification shows speed / progress; pause, resume, stop from the shade |
| 🌙 **Premium dark UI** | Rose-on-black design, smooth cards, progress bars, tab navigation |
| 💾 **Survives restarts** | Session + torrent list saved to disk; reopen the app and downloads continue |
| ⚙️ **Smart queue** | Max active torrents, Wi-Fi-only mode, charging-only mode, seed-ratio stop |
| 📂 **SAF storage** | Pick any folder via the Android Storage Access Framework — no storage permission needed |
| 🧪 **Tested** | 36 JS unit tests + 19 Kotlin engine-logic tests, all green |

---

## 🧠 How It Works (Layman Terms)

Think of Torrently as **three layers stacked on top of each other**:

```
┌─────────────────────────────────────────────┐
│  🎨  WHAT YOU SEE  (React Native / TypeScript)│
│  Screens · Buttons · Progress bars · Theme    │
└──────────────────┬──────────────────────────┘
                   │  calls
┌──────────────────▼──────────────────────────┐
│  🌉  THE BRIDGE  (Kotlin Native Module)      │
│  Translates JS calls → engine commands       │
│  and engine events → JS updates              │
└──────────────────┬──────────────────────────┘
                   │  drives
┌──────────────────▼──────────────────────────┐
│  ⚙️  THE ENGINE  (Kotlin + libtorrent)       │
│  Real peer connections · piece exchange      │
│  DHT · trackers · disk I/O · encryption      │
└──────────────────┬──────────────────────────┘
                   │  writes to
┌──────────────────▼──────────────────────────┐
│  📁  YOUR PHONE STORAGE                      │
│  Whatever folder you picked in Settings      │
└─────────────────────────────────────────────┘
```

### The journey of one download, step by step

1. **You paste a magnet link** (or tap a torrent link in your browser).
2. The app **parses it**, shows you the name/size, and you tap **Start**.
3. The **bridge** passes the magnet to the Kotlin engine.
4. The engine asks the **DHT network** and **trackers**: *"Who has this file?"*
5. Peers respond. The engine **connects** to them and starts trading tiny chunks ("pieces") of the file.
6. Every second, the engine **saves progress to disk** and **emits an update** (speed, % done, peers count).
7. The bridge **forwards** those updates to React Native.
8. The UI **animates** the progress bar in real time.
9. When the app is backgrounded, a **foreground service** keeps the engine alive so downloads don't die.
10. When the last piece arrives, the file is **assembled, checked (hash-verified), and marked complete**.

---

## 🛠 Tech Stack

| Layer | Tool | Why |
|-------|------|-----|
| **UI** | React Native 0.87 (TypeScript) | One codebase, native Android performance |
| **Navigation** | React Navigation 7 | Tabs (Home / Active / Done / Settings) + stack screens |
| **State** | Zustand 5 | Tiny, fast global store — no boilerplate |
| **Native language** | Kotlin 2.2 | Where the real work happens |
| **BitTorrent engine** | libtorrent 2.1 via libtorrent4j | Industry-standard C++ engine, JNI-bound |
| **Database** | Room (SQLite) | Persistent torrent metadata + history |
| **Background work** | Foreground Service (`dataSync`) | Android-approved way to keep downloads alive |
| **Notifications** | NotificationManager + actions | Pause / Resume / Stop from the shade |
| **File access** | Storage Access Framework (SAF) | User picks a folder; no dangerous permissions |
| **Icons** | Lucide (vector) | Crisp at every density |
| **Animations** | Reanimated 4 + Worklets | 60fps UI on the UI thread |

---

## 🚀 Run It

### Prerequisites

```
✅ Node.js 18+          (we used 24)
✅ JDK 17+              (we used 21)
✅ Android SDK 36       (ANDROID_HOME set)
✅ Android device or emulator (API 34+)
```

### 1. Install dependencies

```bash
cd Torrently
npm install
```

### 2. Start the Metro bundler (JS dev server)

```bash
npm start
```

### 3. Run on a connected device / emulator

```bash
npm run android
```

That's it. The app installs and opens on your phone.

> **Tip:** If the device is on a different network, run `adb reverse tcp:8081 tcp:8081` so the phone can reach Metro on your laptop.

---

## 📦 Build the APK

### Debug APK (for quick testing / sharing with friends)

```bash
cd android
./gradlew assembleDebug
```

Output:

```
android/app/build/outputs/apk/debug/Torrently.apk
```

Install it on any phone:

```bash
adb install -r android/app/build/outputs/apk/debug/Torrently.apk
```

### Release APK (for production / Play Store)

```bash
cd android
./gradlew assembleRelease
```

> Release builds are signed with the debug keystore by default (fine for sideloading). For the Play Store, generate your own keystore and update `signingConfigs` in `android/app/build.gradle`.

The APK is **always named `Torrently.apk`** — configured in `build.gradle`:

```gradle
applicationVariants.all { variant ->
    variant.outputs.all { output ->
        outputFileName = "Torrently.apk"
    }
}
```

---

## 🧪 Tests

```bash
# TypeScript / JS unit tests (magnet parser, format helpers, store)
npm test

# Kotlin engine-logic tests (queue rules, pause/resume, seed limits)
cd android && ./gradlew testDebugUnitTest
```

Current status: **36 JS tests ✅ · 19 Kotlin tests ✅ · 0 failures**

---

## 📱 Screens

| Screen | What it does |
|--------|-------------|
| **Home** | Live speed cards, active/completed counts, "Add torrent" button |
| **Active** | List of running downloads with progress, pause/resume |
| **Done** | Completed torrents; open, re-seed, or delete |
| **Settings** | Download folder, Wi-Fi-only, max active, seed limits |
| **Add Torrent** | Paste magnet or pick a `.torrent` file |
| **Torrent Details** | Per-file progress, peers, speeds, piece map |

---

## 🗂 Project Structure

```
Torrently/
├── src/                          # React Native (TypeScript)
│   ├── screens/                  # 6 screens
│   ├── components/               # Reusable UI pieces
│   ├── store/                    # Zustand stores
│   ├── hooks/                    # useEngine, useTorrentActions
│   ├── navigation/               # Tab + stack navigator
│   ├── native/                   # JS ↔ Native bridge types
│   ├── theme/                    # Colors, spacing, typography
│   └── utils/                    # magnet parser, formatters
│
├── android/app/src/main/java/com/torrently/app/
│   ├── torrent/                  # Engine (TorrentEngine, EngineLogic, models)
│   ├── bridge/                   # NativeModule exposed to JS
│   ├── service/                  # Foreground service
│   ├── notifications/            # Notification builder + actions
│   ├── storage/                  # SAF folder picker
│   ├── database/                 # Room (SQLite)
│   └── settings/                 # SharedPreferences wrapper
│
└── __tests__/                    # Jest unit tests
```

---

## ⚖️ Legal

Torrently is a **tool**. It ships with **no content** and **no trackers of its own**.

- Only download content you **own** or that is **legally free** (Linux ISOs, public-domain films, open datasets, etc.).
- The authors are not responsible for how you use this app.
- Engine licenses: **libtorrent** (BSD-3-Clause) · **libtorrent4j** (MIT) — full texts in `android/app/src/main/assets/licenses/`.

---

## 📄 License

MIT © Amit Kumar

---

<div align="center">

**Built with ❤️ and a lot of Gradle builds**

*If this helped you, star ⭐ the repo.*

</div>
