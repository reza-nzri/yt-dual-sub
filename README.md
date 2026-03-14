# 🎬 YT Dual Sub  
### Dual Subtitles for YouTube — Chrome Extension

> 🌍 Watch YouTube with **two subtitles at the same time**  
> Perfect for **language learning, bilingual viewing, research, and accessibility**.

<p align="center">

![Chrome](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)
![TypeScript](https://img.shields.io/badge/TypeScript-Project-blue?logo=typescript)
![License](https://img.shields.io/badge/license-MIT-green)
![Build](https://img.shields.io/badge/build-npm%20run%20build-orange)
![Status](https://img.shields.io/badge/status-active-success)

</p>


<details>
<summary><h2>🎯 Project Overview </h2></summary>

**YT Dual Sub** is a **Google Chrome Extension** that displays **two subtitle tracks simultaneously** on YouTube videos.

Typical usage:

| Subtitle | Description |
|--------|-------------|
| 🟦 Original | Native subtitle language |
| 🟩 Translation | Target language |

Example:

```
Original:  I think this is a great idea.
Translated: Ich denke, das ist eine großartige Idee.
```
</details>

<details>
<summary><h2>✨ Features</h2></summary>

### ⚡ Lightweight

- No external APIs
- No backend server
- Works directly with YouTube caption tracks


### 🧩 Built with modern stack

- TypeScript
- Chrome Extension Manifest v3
- DOM overlay rendering

### 🎨 Customizable UI

Options include:

- subtitle font size
- colors
- layout mode
- spacing
- background opacity

### 🔁 Smart retry logic

Handles:

- empty responses
- network retries
- YouTube rate limits

### 📚 Supports

- manual subtitles
- auto-generated captions (ASR)
- translated subtitles (when available)
</details>

<details>
<summary><h2>🚀 Installation</h2></summary>

### 1️⃣ Clone repository

```bash
git clone https://github.com/reza-nzri/yt-dual-sub.git
````

### 2️⃣ Enter project

```bash
cd yt-dual-sub
```

### 3️⃣ Install dependencies

```bash
npm install
```

### 4️⃣ Build extension

```bash
npm run build
```

### 5️⃣ Load into Chrome

Open:

```
chrome://extensions
```

Enable:

```
Developer Mode
```

Click:

```
Load unpacked
```

Select folder:

```
dist/
```

Done 🎉

</details>

<details>
<summary><h2>🎮 Usage</h2> : How to use the extension</summary>

1️⃣ Open a YouTube video

```
https://youtube.com/watch?v=...
```

2️⃣ Enable subtitles on YouTube

```
CC button
```

3️⃣ Open extension popup

4️⃣ Select:

* target language
* layout mode
* subtitle visibility

5️⃣ Watch with dual subtitles 🎉

</details>

<details>
<summary><h2>🧠 How It Works</h2> : Internal Workflow</summary>

The extension works using **four main components**.

## 1️⃣ Page Bridge

Injected script reads YouTube player state.

Source:

```
ytInitialPlayerResponse
```

Extracts:

* captionTracks
* selectedTrack
* translationLanguages

## 2️⃣ Subtitle Fetcher

Captions are fetched from:

```
https://www.youtube.com/api/timedtext
```

Example:

```
/api/timedtext?v=VIDEOID&lang=en&fmt=json3
```

## 3️⃣ Cue Parser

Parses YouTube caption format:

```
json3
```

Example:

```
events -> segs -> utf8
```

Converted to:

```
SubtitleCue[]
```

## 4️⃣ Overlay Renderer

Subtitles rendered as overlay inside:

```
.html5-video-player
```

Display modes:

```
column
row
```

</details>

<details>
<summary><h2>🏗 Architecture</h2></summary>

```
YouTube Page
     │
     ▼
Page Bridge
     │
     ▼
Content Script
     │
     ▼
Subtitle Fetcher
     │
     ▼
Cue Parser
     │
     ▼
Overlay Renderer
```

Key modules:

| Module         | Responsibility            |
| -------------- | ------------------------- |
| page-bridge.ts | Read YouTube player state |
| captions.ts    | Fetch and parse captions  |
| index.ts       | Synchronization logic     |
| overlay.ts     | DOM overlay container     |
| renderer.ts    | Render subtitle text      |

</details>

<details>
<summary><h2>🛠 Development Setup</h2></summary>

### Install dependencies

```bash
npm install
```

### Build extension

```bash
npm run build
```

### Watch mode

```bash
npm run dev
```

### Debug logs

Open DevTools on YouTube page.

Search logs:

```
[YT Dual Sub]
```

Example logs:

```
fetchSubtitleCues
subtitle cache hit
blocked html response
refreshTracksIfNeeded
```

</details>

## ⚠ Known YouTube Behavior

<details>
<summary>📡 YouTube caption API limitations</summary>

Endpoint:

```
/api/timedtext
```

is **not a public API**.

Sometimes responses may be:

```
200 OK
Content-Length: 0
```

or

```
empty HTML response
```

Reasons include:

* rate limiting
* caption restrictions
* missing parameters
* translation not supported

The extension includes:

* retry logic
* caching
* request deduplication

</details>

<details>
<summary><h2>🤝 Contributing</h2> : How to contribute</summary>

### 1️⃣ Fork repository

### 2️⃣ Create branch

```
feature/my-feature
```

### 3️⃣ Commit changes

```
git commit -m "Add subtitle alignment improvement"
```

### 4️⃣ Push branch

### 5️⃣ Open Pull Request

</details>

<details>
<summary><h2>🚀 Planned Features</h2></summary>

* subtitle delay adjustment
* AI translation fallback
* vocabulary learning mode
* subtitle export
* Firefox support
* subtitle highlighting
* mobile support
</details>

<details>
<summary><h3>🔍 SEO Keywords</h3></summary>

```
youtube dual subtitles
youtube bilingual subtitles
youtube subtitle extension
youtube caption translator
dual caption youtube chrome extension
two subtitles youtube extension
language learning youtube subtitles
youtube subtitle overlay extension
youtube captions parser extension

youtube captions api timedtext
youtube captionTracks parser
chrome extension subtitle overlay
youtube player response captions
dual subtitle extension youtube
youtube subtitle translation extension
youtube json3 subtitles parser
```
</details>

## ⭐ Support

If you like this project:

⭐ Star the repository
🐛 Report issues
🔧 Submit pull requests

## 👨‍💻 Author

Created by **Reza Nazari**

## 🚀 Final Note

YouTube subtitle behavior changes frequently.
This project focuses on building the **most robust dual subtitle extension possible** while staying compatible with YouTube.

