import * as tf from '@tensorflow/tfjs'
import * as mobilenet from '@tensorflow-models/mobilenet'
import { sourceToFrameTensor, blobToFrameTensor } from './capture.js'
import { VideoRecorder } from './video-recorder.js'

const $ = (id) => document.getElementById(id)
const setDisabled = (id, val) => { const el = $(id); if (el) el.disabled = val }

const video = $('video')
const statusEl = $('status')
const identifyStatusEl = $('identify-status')
const classNameInput = $('class-name')
const classSelect = $('class-select')
const sampleCountsEl = $('sample-counts')
const resultEl = $('result')
const resultLabel = $('result-label')
const resultConf = $('result-conf')

let mobileNetModel = null
let classifier = null
let classIndexMap = []
let liveLoopId = null
let lastIdentification = null
const videoRecorder = new VideoRecorder()
/** @type {Blob | null} */
let recordedVideoBlob = null

const classes = []
const samples = [] // { classId, embedding, imageDataUrl }

// --- My Room gallery (persistent) ---
const GALLERY_KEY = 'my-room-gallery'

function loadGallery() {
  try {
    const raw = localStorage.getItem(GALLERY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveGallery(items) {
  localStorage.setItem(GALLERY_KEY, JSON.stringify(items))
}

function addToGallery(imageDataUrl, className) {
  const items = loadGallery()
  items.unshift({
    id: `gallery_${Date.now()}`,
    imageDataUrl,
    className,
    createdAt: new Date().toISOString(),
  })
  saveGallery(items)
  renderMyRoomGallery()
}

function removeFromGallery(id) {
  saveGallery(loadGallery().filter((i) => i.id !== id))
  renderMyRoomGallery()
}

function clearGallery() {
  if (!confirm('Clear all saved gallery items? This cannot be undone.')) return
  saveGallery([])
  renderMyRoomGallery()
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch { return iso }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
}

function renderMyRoomGallery() {
  const container = $('my-room-gallery')
  if (!container) return
  const items = loadGallery()
  if (items.length === 0) {
    container.innerHTML = '<p class="gallery-empty">Nothing saved yet. Train some samples and click <strong>Save to gallery</strong>.</p>'
    return
  }
  container.innerHTML = ''
  const grid = document.createElement('div')
  grid.className = 'my-room-grid'
  for (const item of items) {
    const card = document.createElement('div')
    card.className = 'my-room-card'
    card.innerHTML = `
      <img src="${item.imageDataUrl}" alt="${escapeHtml(item.className)}" loading="lazy" />
      <span class="my-room-card__name">${escapeHtml(item.className)}</span>
      <span class="my-room-card__date">${escapeHtml(formatDate(item.createdAt))}</span>
      <button type="button" class="my-room-card__delete" data-gallery-id="${item.id}" title="Remove from gallery">&times;</button>
    `
    card.querySelector('.my-room-card__delete').addEventListener('click', (e) => {
      e.stopPropagation()
      removeFromGallery(item.id)
    })
    grid.append(card)
  }
  container.append(grid)
}

// --- Capture frame as data URL ---
function captureFrameDataUrl() {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null
  const scale = Math.min(1, 480 / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

// --- Camera ---
async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: 280, height: 280 },
    audio: false,
  })
  video.srcObject = stream
  await video.play()
}

async function loadMobileNet() {
  statusEl.textContent = 'Loading MobileNet…'
  mobileNetModel = await mobilenet.load({ version: 2, alpha: 0.5 })
  statusEl.textContent = 'Ready. Add classes, capture samples, then train.'
  $('btn-capture').disabled = false
}

function getFrameTensor() {
  return sourceToFrameTensor(video)
}

function addEmbeddingSample(classId, embedding, imageDataUrl) {
  samples.push({ classId, embedding: embedding.clone(), imageDataUrl })
}

// --- Training gallery ---
function renderTrainingGallery() {
  const container = $('training-gallery')
  const grid = $('training-gallery-grid')
  const label = $('training-gallery-class')
  if (!container || !grid || !label) return

  const classId = classSelect.value
  if (!classId) {
    container.hidden = true
    return
  }

  const className = classes.find((c) => c.classId === classId)?.name ?? '—'
  label.textContent = className

  const classSamples = samples.filter((s) => s.classId === classId)
  if (classSamples.length === 0) {
    container.hidden = true
    return
  }

  container.hidden = false
  grid.innerHTML = ''
  for (let i = 0; i < classSamples.length; i++) {
    const s = classSamples[i]
    const card = document.createElement('div')
    card.className = 'sample-card'
    card.innerHTML = `
      <img src="${s.imageDataUrl || ''}" alt="Sample ${i + 1}" loading="lazy" />
      <span class="sample-card__num">#${i + 1}</span>
      <button type="button" class="sample-card__save" title="Save to gallery">Save to gallery</button>
    `
    card.querySelector('.sample-card__save').addEventListener('click', (e) => {
      e.stopPropagation()
      if (s.imageDataUrl) {
        addToGallery(s.imageDataUrl, className)
        statusEl.textContent = `Saved "${className}" to gallery.`
      }
    })
    grid.append(card)
  }
}

// --- Import helpers ---
async function importFrameBlobs(frameBlobs, classId, onProgress) {
  if (!mobileNetModel || !classId) return 0

  let added = 0
  for (let i = 0; i < frameBlobs.length; i++) {
    onProgress?.(`Embedding frame ${i + 1} / ${frameBlobs.length}…`)
    const frame = await blobToFrameTensor(frameBlobs[i])
    const embedding = mobileNetModel.infer(frame, true)
    frame.dispose()

    // Convert blob to data URL for gallery display
    let imageDataUrl = null
    try {
      const blob = frameBlobs[i]
      if (blob instanceof Blob && blob.type.startsWith('image/')) {
        imageDataUrl = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.readAsDataURL(blob)
        })
      }
    } catch { /* ignore */ }

    addEmbeddingSample(classId, embedding, imageDataUrl)
    embedding.dispose()
    added++
  }
  updateCounts()
  renderTrainingGallery()
  return added
}

function updateClassSelect() {
  classSelect.innerHTML = ''
  if (classes.length === 0) {
    classSelect.disabled = true
    const opt = document.createElement('option')
    opt.value = ''
    opt.textContent = 'Add a class first'
    classSelect.append(opt)
    updateVideoUi()
    renderTrainingGallery()
    return
  }
  classSelect.disabled = false
  for (const c of classes) {
    const opt = document.createElement('option')
    opt.value = c.classId
    opt.textContent = c.name
    classSelect.append(opt)
  }
  updateVideoUi()
  renderTrainingGallery()
}

function updateCounts() {
  if (classes.length === 0) {
    sampleCountsEl.textContent = 'No classes yet.'
    $('btn-train').disabled = true
    return
  }
  const ul = document.createElement('ul')
  for (const c of classes) {
    const count = samples.filter((s) => s.classId === c.classId).length
    const li = document.createElement('li')
    li.textContent = `${c.name}: ${count} samples`
    ul.append(li)
  }
  sampleCountsEl.innerHTML = ''
  sampleCountsEl.append(ul)

  const canTrain =
    classes.length >= 2 &&
    classes.every((c) => samples.filter((s) => s.classId === c.classId).length >= 3)
  $('btn-train').disabled = !canTrain
}

function addClass() {
  const name = classNameInput.value.trim()
  if (!name) return
  const classId = `class_${Date.now()}`
  classes.push({ classId, name })
  classNameInput.value = ''
  updateClassSelect()
  classSelect.value = classId
  updateCounts()
  renderTrainingGallery()
}

function captureSample() {
  if (!mobileNetModel || !classSelect.value) return
  const imageDataUrl = captureFrameDataUrl()
  const frame = getFrameTensor()
  const embedding = mobileNetModel.infer(frame, true)
  frame.dispose()
  addEmbeddingSample(classSelect.value, embedding, imageDataUrl)
  embedding.dispose()
  updateCounts()
  renderTrainingGallery()
  statusEl.textContent = `Captured sample for "${classes.find((c) => c.classId === classSelect.value)?.name}".`
}

function updateVideoUi() {
  const hasVideo = Boolean(recordedVideoBlob)
  setDisabled('btn-extract-frames', !hasVideo || !classSelect.value || !mobileNetModel)
  setDisabled('btn-clear-video', !hasVideo)
  $('video-preview-wrap').hidden = !hasVideo
  if (hasVideo && recordedVideoBlob) {
    const preview = $('video-preview')
    if (preview.src && preview.src.startsWith('blob:')) {
      URL.revokeObjectURL(preview.src)
    }
    preview.src = URL.createObjectURL(recordedVideoBlob)
  }
}

function clearVideo() {
  const preview = $('video-preview')
  if (preview?.src?.startsWith('blob:')) URL.revokeObjectURL(preview.src)
  recordedVideoBlob = null
  statusEl.textContent = 'Video cleared.'
  updateVideoUi()
}

async function toggleRecordVideo() {
  const btn = $('btn-record-video')
  if (videoRecorder.isRecording) {
    btn.disabled = true
    statusEl.textContent = 'Stopping recording…'
    try {
      recordedVideoBlob = await videoRecorder.stop()
      btn.textContent = 'Record video'
      btn.classList.remove('btn--danger')
      statusEl.textContent = `Recorded ${Math.round(recordedVideoBlob.size / 1024)} KB. Extract frames to add training samples.`
      updateVideoUi()
    } catch (err) {
      statusEl.textContent = `Recording failed: ${err.message}`
    } finally {
      btn.disabled = false
    }
    return
  }

  if (!video.srcObject) {
    statusEl.textContent = 'Camera is not ready.'
    return
  }

  try {
    videoRecorder.start(video.srcObject)
    btn.textContent = 'Stop recording'
    btn.classList.add('btn--danger')
    statusEl.textContent = 'Recording… Move slowly around your item, then stop.'
  } catch (err) {
    statusEl.textContent = `Could not start recording: ${err.message}`
  }
}

async function handleVideoUpload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  recordedVideoBlob = file
  statusEl.textContent = `Loaded "${file.name}". Extract frames to add training samples.`
  updateVideoUi()
}

async function extractAndImportFrames() {
  if (!recordedVideoBlob || !classSelect.value || !mobileNetModel) return

  const fps = Math.max(0.25, Number($('frame-fps').value) || 1)
  const maxFrames = Math.min(120, Math.max(3, Number($('frame-max').value) || 30))
  const classId = classSelect.value
  const className = classes.find((c) => c.classId === classId)?.name ?? 'class'

  setDisabled('btn-extract-frames', true)
  setDisabled('btn-record-video', true)
  setDisabled('btn-import-images', true)
  setDisabled('btn-clear-video', true)

  try {
    statusEl.textContent = 'Extracting frames…'
    const { extractFrames } = await import('./ffmpeg-frames.js')
    const frames = await extractFrames(recordedVideoBlob, {
      fps,
      maxFrames,
      onProgress: (msg) => {
        statusEl.textContent = msg
      },
    })

    if (frames.length === 0) {
      statusEl.textContent = 'No frames extracted. Try a longer video or lower fps.'
      return
    }

    const added = await importFrameBlobs(frames, classId, (msg) => {
      statusEl.textContent = msg
    })
    statusEl.textContent = `Added ${added} sample(s) for "${className}" from video frames.`
  } catch (err) {
    statusEl.textContent = `Frame extraction failed: ${err.message}`
    console.error(err)
  } finally {
    setDisabled('btn-extract-frames', false)
    setDisabled('btn-record-video', false)
    setDisabled('btn-import-images', false)
    setDisabled('btn-clear-video', false)
    updateVideoUi()
  }
}

async function handleImageUpload(event) {
  const files = [...(event.target.files ?? [])].filter((f) => f.type.startsWith('image/'))
  event.target.value = ''
  if (files.length === 0 || !classSelect.value || !mobileNetModel) return

  const classId = classSelect.value
  const className = classes.find((c) => c.classId === classId)?.name ?? 'class'

  $('btn-import-images').disabled = true
  try {
    const added = await importFrameBlobs(files, classId, (msg) => {
      statusEl.textContent = msg
    })
    statusEl.textContent = `Added ${added} sample(s) for "${className}" from uploaded images.`
  } catch (err) {
    statusEl.textContent = `Image import failed: ${err.message}`
    console.error(err)
  } finally {
    $('btn-import-images').disabled = false
  }
}

function clearSamples() {
  for (const s of samples) s.embedding.dispose()
  samples.length = 0
  if (classifier) {
    classifier.dispose()
    classifier = null
  }
  classIndexMap = []
  lastIdentification = null
  $('btn-identify').disabled = true
  $('btn-identify-loop').disabled = true
  updateCounts()
  renderTrainingGallery()
  statusEl.textContent = 'Samples cleared.'
  updateVideoUi()
}

async function trainModel() {
  if (classes.length < 2) return

  const overlay = $('training-overlay')
  overlay?.removeAttribute('hidden')

  $('btn-train').disabled = true
  statusEl.textContent = 'Training…'

  classIndexMap = classes.map((c) => c.classId)
  const numClasses = classIndexMap.length
  const xsList = []
  const ysList = []

  for (const s of samples) {
    const idx = classIndexMap.indexOf(s.classId)
    if (idx < 0) continue
    xsList.push(s.embedding.squeeze([0]))
    ysList.push(idx)
  }

  const xs = tf.stack(xsList)
  const ys = tf.oneHot(tf.tensor1d(ysList, 'int32'), numClasses)

  if (classifier) classifier.dispose()

  classifier = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [xs.shape[1]], units: 64, activation: 'relu' }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: numClasses, activation: 'softmax' }),
    ],
  })

  classifier.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'categoricalCrossentropy',
  })

  await classifier.fit(xs, ys, {
    epochs: 25,
    batchSize: Math.min(16, xs.shape[0]),
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch) => {
        statusEl.textContent = `Training… epoch ${epoch + 1} / 25`
      },
    },
  })

  xs.dispose()
  ys.dispose()

  overlay?.setAttribute('hidden', '')

  statusEl.textContent = 'Model trained. Go to Identify.'
  $('btn-identify').disabled = false
  $('btn-identify-loop').disabled = false
  updateCounts()
}

async function identifyOnce() {
  if (!classifier || !mobileNetModel) return null

  const frame = getFrameTensor()
  const embedding = mobileNetModel.infer(frame, true)
  frame.dispose()

  const pred = classifier.predict(embedding)
  const probs = await pred.data()
  pred.dispose()
  embedding.dispose()

  let bestIdx = 0
  let bestProb = probs[0]
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > bestProb) {
      bestProb = probs[i]
      bestIdx = i
    }
  }

  const className = classes.find((c) => c.classId === classIndexMap[bestIdx])?.name ?? 'Unknown'
  const pct = Math.round(bestProb * 100)

  resultEl.hidden = false
  resultLabel.textContent = className
  resultConf.textContent = `${pct}% confidence`

  lastIdentification = { className, pct }

  return lastIdentification
}

function stopLiveLoop() {
  if (liveLoopId != null) {
    cancelAnimationFrame(liveLoopId)
    liveLoopId = null
  }
  $('btn-identify-loop').textContent = 'Live identify'
}

function toggleLiveIdentify() {
  if (liveLoopId != null) {
    stopLiveLoop()
    return
  }
  $('btn-identify-loop').textContent = 'Stop live'
  let lastRun = 0
  const tick = async (t) => {
    if (liveLoopId == null) return
    if (t - lastRun > 500) {
      lastRun = t
      await identifyOnce()
    }
    liveLoopId = requestAnimationFrame(tick)
  }
  liveLoopId = requestAnimationFrame(tick)
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab
      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.toggle('is-active', t === tab)
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false')
      })
      $('panel-train').hidden = name !== 'train'
      $('panel-identify').hidden = name !== 'identify'
      $('panel-gallery').hidden = name !== 'gallery'
      if (name !== 'identify') stopLiveLoop()
      if (name === 'gallery') renderMyRoomGallery()
      if (name === 'train') renderTrainingGallery()
    })
  })
}


$('btn-add-class').addEventListener('click', addClass)
classNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addClass()
})
$('btn-capture').addEventListener('click', captureSample)
$('btn-train').addEventListener('click', () =>
  trainModel().catch((err) => {
    const overlay = $('training-overlay')
    overlay?.setAttribute('hidden', '')
    statusEl.textContent = `Training failed: ${err.message}`
    console.error(err)
  }),
)
$('btn-clear').addEventListener('click', clearSamples)
$('btn-record-video')?.addEventListener('click', () => toggleRecordVideo().catch(console.error))
$('btn-extract-frames')?.addEventListener('click', () => extractAndImportFrames().catch(console.error))
$('btn-clear-video')?.addEventListener('click', clearVideo)
$('video-upload')?.addEventListener('change', (e) => handleVideoUpload(e).catch(console.error))
$('image-upload')?.addEventListener('change', (e) => handleImageUpload(e).catch(console.error))
classSelect.addEventListener('change', () => {
  updateVideoUi()
  renderTrainingGallery()
})
$('btn-identify').addEventListener('click', () => identifyOnce().catch(console.error))
$('btn-identify-loop').addEventListener('click', toggleLiveIdentify)
$('btn-clear-my-room')?.addEventListener('click', clearGallery)

setupTabs()
renderMyRoomGallery()

;(async () => {
  try {
    await initCamera()
    await loadMobileNet()
    updateCounts()
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}. Camera access is required.`
    console.error(err)
  }
})()