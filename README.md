# My Room

Hands-on capstone for **Her AI Studio — Week 1**. This app lets you train a camera classifier to recognize your belongings, identify them with your camera, and keep a photo journal with notes.

The big question for this lesson: **where does your data go, and where do the models actually run?**

---

## Run locally

```bash
cd plant-journal
npm install
npm run dev
```

Open http://localhost:5174 and allow camera access when prompted.

---

## Parts of the app

The app has three tabs. Each one uses different data and different models.

### Train

**What you do:** Name classes (e.g. `Nintendo Switch game`, `Copic marker`, `Pokémon card`), collect training samples, then train a classifier.

**How you collect samples:**
- **Capture sample** — grab a single still frame from the live webcam
- **Train from video** — record or upload a short clip, then use ffmpeg to extract frames into training samples
- **Import images** — upload JPEGs (for example, frames you extracted with the local script below)

**What runs here:**

| Piece | What it is | Where it runs |
|-------|-----------|---------------|
| **MobileNet** | Pre-trained vision model that turns each image into a numeric "fingerprint" (embedding) | Your browser (TensorFlow.js). Weights download once from the internet, then inference is local. |
| **Your classifier** | Small model you train on top of those fingerprints to tell *your* classes apart | Your browser. Trained and stored in memory for this session. |
| **ffmpeg.wasm** | Extracts still frames from a video | Your browser. The ffmpeg engine downloads once from a CDN; your video never leaves the device. |

**Where the data goes:**

| Data | Stays on device? | Notes |
|------|------------------|-------|
| Webcam feed | Yes | Stays in the browser. Never uploaded. |
| Recorded / uploaded video | Yes | Processed in memory. Never uploaded. |
| Training samples (embeddings) | Yes, but temporary | Kept in browser memory only. Refreshing the page clears them. |
| Trained classifier | Yes, but temporary | Same as above — gone after a refresh. |

There is **no server** and **no cloud training**. You are the dataset creator and the model trainer.

---

### Identify

**What you do:** Point the camera at an item and run **Identify item** (or **Live identify**). Save a check-in to your journal.

**What runs here:**

| Piece | What it is | Where it runs |
|-------|-----------|---------------|
| **MobileNet** | Converts the live camera frame to an embedding | Your browser |
| **Your classifier** | Compares the embedding to your trained classes and picks the best match | Your browser |

**Where the data goes:**

| Data | Stays on device? | Notes |
|------|------------------|-------|
| Live camera frames | Yes | Processed frame-by-frame in the browser |
| Prediction (name + confidence) | Yes | Shown on screen; optionally saved to the journal |
| Journal photo | Yes | Captured locally when you click **Save to journal** |

Photos and predictions are **not** sent to any AI service during identification.

---

### Journal

**What you do:** Browse saved entries, ask questions with Ollama, and generate answers about your items.

**What runs here:**

| Piece | What it is | Where it runs |
|-------|-----------|---------------|
| **Ollama (optional)** | Local language model that answers questions about your items | **Your computer**, via `http://localhost:11434` |

**Where the data goes:**

| Data | Stays on device? | Notes |
|------|------------------|-------|
| Journal entries (photos + notes) | Yes | Saved in `localStorage` in your browser |
| Ollama settings (URL, model name) | Yes | Saved in `localStorage` |
| Text sent to Ollama | Yes, on your machine | Only the **item name** and **your question text**. No photos. |
| Ollama responses | Yes | Generated locally; displayed in the app |

If Ollama is not running, the app shows a helpful message. Nothing breaks.

---

## Data flow at a glance

```
Camera / video / images
        │
        ▼
   Your browser  ──►  MobileNet (vision model, local)
        │                    │
        │                    ▼
        │             Training samples / predictions
        │                    │
        ▼                    ▼
   ffmpeg.wasm          Your classifier (local)
   (frame extraction)
        │
        ▼
   Journal photos  ──►  localStorage (on your device)

Item name + question  ──►  Ollama on localhost (optional, text only)
```

**Key takeaway for Week 1:** Most of this app keeps your photos and training data in the browser on your device. The only "AI model" that receives any of your content is Ollama — and even then, it only gets text, not images. You choose when to use it.

---

## What downloads from the internet (not your data)

These are **one-time downloads** of model code and weights. Your photos and videos are not uploaded as part of this.

| Asset | Why | When |
|-------|-----|------|
| MobileNet weights | Pre-trained vision model | First time you open the Train or Identify tab |
| ffmpeg.wasm core | Video frame extraction | First time you click **Extract frames & add samples** |

After the first load, your browser caches most of this.

---

## Workflow

1. **Train:** Add at least two classes with three or more samples each. Use the webcam, video + ffmpeg, or imported images. Click **Train model**.
2. **Identify:** Point at an item, click **Identify item**, add an optional note, then **Save to journal**.
3. **Journal:** Browse entries. Ask questions with Ollama (optional).

### Train from video (ffmpeg)

Under **Train → Train from video**:

1. Select an active class
2. **Record video** or **Upload video**
3. Set frames per second and max frames
4. Click **Extract frames & add samples**

Or extract frames on your machine with system ffmpeg:

```bash
npm run extract-frames -- path/to/video.mp4
```

Then import the JPEG folder with **Import images**.

---

## Ollama setup (optional)

Default: `http://localhost:11434`, model `qwen2.5`. Change under **Journal → Ollama settings**.

```bash
ollama serve
ollama pull qwen2.5
```

**Privacy reminder:** Only item names and questions are sent to Ollama, not photos. Journal photos stay in `localStorage` on your device. Keep the base URL on `localhost` if you want everything to stay on your machine.

---

## Check your understanding

1. When you capture a training sample, where is that image stored?
2. What is the difference between MobileNet and the classifier you train?
3. If you save a journal entry, where does the photo live?
4. What text (if any) leaves your browser when you ask Ollama a question?
5. What happens to your trained model if you refresh the page?