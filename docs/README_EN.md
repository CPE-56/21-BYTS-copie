# 21 BYTS - Cross-Platform Audio Downloader

[![Core Module Tests](https://github.com/CPE-56/21-BYTS-copie/actions/workflows/test.yml/badge.svg)](https://github.com/CPE-56/21-BYTS-copie/actions/workflows/test.yml)

![21 BYTS Logo](./src/assets/images/logo.png)

## Overview

21 BYTS is a modern desktop application for downloading high-quality audio files from various streaming platforms (YouTube, Bandcamp, SoundCloud, Spotify, Tidal, etc.). It features an intuitive user interface and optimized performance across macOS, Windows, and Linux.

## ⚠️ Legal Notice

**PLEASE READ CAREFULLY:**

* **Private use only**: This application is strictly intended for personal and private use.
* **Requires a valid Tidal subscription**: Access to Tidal features requires a valid user account.
* **Respect copyright laws**: Do not use this app to distribute or pirate copyrighted music.
* **Legal status varies**: The use of such tools may be illegal in your country—check your local laws before using.

The developers of 21 BYTS are not responsible for any misuse. All downloaded content remains the responsibility of the end user.

## Key Features

* Download audio from multiple platforms: YouTube, Bandcamp, SoundCloud, Spotify, Tidal
* Modern and user-friendly interface
* Convert to high-quality formats: MP3 320kbps, WAV, FLAC, AIFF
* Smart metadata handling (title, artist, album, cover)
* Playlist support (up to 200 tracks)
* Secure Tidal login with OAuth
* Automatic updates

## Installation

### Requirements

* Node.js 16 or higher
* FFmpeg (automatically installed by the app)
* yt-dlp (automatically installed by the app)

### Download

Download the latest version from the [releases page](https://github.com/CPE-56/21-BYTS-copie/releases).

### Installation

#### macOS

1. Open the `.dmg` file
2. Drag the app into your Applications folder
3. On first launch, right-click and select "Open" to bypass Gatekeeper

#### Windows

1. Run the `.exe` installer
2. Follow the setup instructions
3. The app will appear in your Start menu

#### Linux

1. Download the `.AppImage` or `.deb` package
2. For AppImage:

   * Make it executable: `chmod +x 21BYTS-x.x.x.AppImage`
   * Launch it: `./21BYTS-x.x.x.AppImage`
3. For Debian package:

   * Install: `sudo dpkg -i 21BYTS-x.x.x.deb`
   * Launch from your application menu

## Quick Start Guide

1. **Add a link**: Click the “+” button or paste a streaming URL
2. **Choose format**: Select MP3, WAV, FLAC, or AIFF from the dropdown
3. **Download**: Click the download icon to begin
4. **Library**: Add downloaded files to your music library with the dedicated button

## Technical Architecture

21 BYTS is built on a modular, event-driven architecture:

* **Frontend**: HTML/CSS/JavaScript with isolated components
* **Backend**: Node.js and Electron for system access
* **Communication**: Central event bus for decoupled modules
* **Structure**: Single File Components architecture for maintainability

## Contributing

### Developer Setup

1. Clone the repository:

```bash
git clone https://github.com/CPE-56/21-BYTS-copie.git
cd 21-BYTS-copie
```

2. Install dependencies:

```bash
npm install
```

3. Run in development mode:

```bash
npm run dev
```

### Development Principles

* Follow the event-driven architecture
* Each file must be self-contained and communicate only via the event bus
* Document all emitted and listened events
* Follow coding conventions outlined in `DEVELOPMENT.md`

## License

This project is released under a modified MIT License. See the LICENSE file for details.

---

Crafted with care, passion, and a generous dose of caffeine ☕ by the 21 BYTS team.
