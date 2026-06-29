# My Room

Hands-on demo for **Her AI Studio — Week 1**. This app lets you train a camera classifier to recognize your belongings and identify them with your camera.

The two big questions for this app are: **where does your data go, and where do the models actually run?**

---

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5174 and allow camera access when prompted.

---

## Parts of the app

The app has three tabs. Each one uses different data and different models.

### Train

**What you do:** Name classes (e.g. `Crystal collection`, `Copic marker`, `Pokémon card`), collect training samples, then train a classifier.

**How you collect samples:**
- **Capture sample** — grab a single still frame from the live webcam
- **Train from video** — record or upload a short clip, then use ffmpeg to extract frames into training samples
- **Import images** — upload JPEGs (for example, frames you extracted with the local script below)

**Training gallery:** Each captured/imported sample shows as a thumbnail in the Train panel. Samples are stored in memory only — they disappear on page refresh. Click **Save to gallery** on any sample to keep it permanently in the My Room tab.

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
| Training sample images | Yes, but temporary | In memory only. Not persisted. |

There is **no server** and **no cloud training**. You are the dataset creator and the model trainer.

---

### Identify

**What you do:** Point the camera at an item and run **Identify item** (or **Live identify**).

**What runs here:**

| Piece | What it is | Where it runs |
|-------|-----------|---------------|
| **MobileNet** | Converts the live camera frame to an embedding | Your browser |
| **Your classifier** | Compares the embedding to your trained classes and picks the best match | Your browser |

**Where the data goes:**

| Data | Stays on device? | Notes |
|------|------------------|-------|
| Live camera frames | Yes | Processed frame-by-frame in the browser |
| Prediction (name + confidence) | Yes | Shown on screen |

Photos and predictions are **not** sent to any AI service during identification.

---

### My Room

**What you do:** Browse the photos you've chosen to save from your training samples. Each saved photo shows the class name and the date it was saved.

Saved items persist in `localStorage` and survive page refreshes. You can delete individual items or clear the entire gallery.

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
   Training gallery (in memory)
        │
        ▼  (click "Save to gallery")
   My Room gallery (localStorage, persistent)
```

**Key takeaway for Week 1:** Everything in this app — vision and classification — runs locally in your browser. Your photos and videos never leave your device.

---

## What downloads from the internet (not your data)

These are **one-time downloads** of model weights. Your photos and videos are not uploaded as part of this.

| Asset | Why | When | Approx size |
|-------|-----|------|-------------|
| MobileNet weights | Pre-trained vision model | First time you open the Train or Identify tab | ~16 MB |
| ffmpeg.wasm core | Video frame extraction | First time you click **Extract frames & add samples** | ~30 MB |

After the first load, your browser caches all of this. Subsequent loads are instant.

---

## Workflow

1. **Train:** Add at least two classes with three or more samples each. Use the webcam, video + ffmpeg, or imported images. Click **Train model**.
2. **Identify:** Point at an item, click **Identify item** to see the prediction.
3. **My Room:** While training, click **Save to gallery** on any sample to keep a permanent copy. Browse them anytime in the My Room tab.

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

## Check your understanding

1. When you capture a training sample, where is that image stored?
2. What is the difference between MobileNet and the classifier you train?
3. What happens to your trained model if you refresh the page?
4. How is "Save to gallery" different from a regular training sample?