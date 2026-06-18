import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const CORE_VERSION = '0.12.6'
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`

/** @type {FFmpeg | null} */
let ffmpeg = null

export async function loadFfmpeg(onProgress) {
  if (ffmpeg?.loaded) return ffmpeg

  ffmpeg = new FFmpeg()
  ffmpeg.on('log', ({ type, message }) => {
    console.log(`[ffmpeg ${type}]`, message)
    if (onProgress) onProgress(message)
  })

  onProgress?.('Loading ffmpeg…')

  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
  })

  onProgress?.('ffmpeg ready.')
  return ffmpeg
}

/**
 * Extract JPEG frames from a video blob at the given fps.
 * @param {Blob} videoBlob
 * @param {{ fps?: number, maxFrames?: number, onProgress?: (message: string) => void }} [options]
 * @returns {Promise<Blob[]>}
 */
export async function extractFrames(videoBlob, options = {}) {
  const { fps = 1, maxFrames = 30, onProgress } = options

  // Decode frames in the browser using VideoDecoder — no wasm memory pressure
  onProgress?.('Decoding video…')
  const frames = await decodeFramesFromBlob(videoBlob, fps, maxFrames, onProgress)

  if (frames.length === 0) {
    throw new Error('No frames extracted. Try a shorter video or lower fps.')
  }

  onProgress?.(`Extracted ${frames.length} frame(s).`)
  return frames
}

/**
 * Use the browser's native VideoDecoder + canvas to extract frames.
 * Much more memory-efficient than ffmpeg.wasm for this use case.
 */
async function decodeFramesFromBlob(blob, fps, maxFrames, onProgress) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.src = URL.createObjectURL(blob)
    video.muted = true
    video.playsInline = true

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = 224
    canvas.height = 224

    const frames = []
    let currentTime = 0
    let interval = 1 / fps

    video.addEventListener('loadedmetadata', () => {
      const duration = video.duration
      if (!isFinite(duration)) {
        // webm from MediaRecorder often has no duration — seek trick
        video.currentTime = 1e101
      } else {
        startCapture(duration)
      }
    })

    // For webm blobs with no duration, this fires after the seek trick
    video.addEventListener('timeupdate', function onTimeUpdate() {
      if (video.currentTime > 0 && !isFinite(video.duration) === false) {
        video.removeEventListener('timeupdate', onTimeUpdate)
        startCapture(video.duration)
      }
    })

    // Fallback for webm blobs that never report duration
    video.addEventListener('seeked', function onSeeked() {
      if (!isFinite(video.duration)) {
        video.removeEventListener('seeked', onSeeked)
        startCapture(video.currentTime)
      }
    })

    video.addEventListener('error', (e) => {
      reject(new Error(`Video load error: ${video.error?.message ?? e}`))
    })

    video.load()

    function startCapture(duration) {
      currentTime = 0

      function captureNext() {
        if (currentTime > duration || frames.length >= maxFrames) {
          URL.revokeObjectURL(video.src)
          resolve(frames)
          return
        }

        onProgress?.(`Capturing frame ${frames.length + 1} at ${currentTime.toFixed(2)}s…`)
        video.currentTime = currentTime

        video.addEventListener('seeked', function onSeeked() {
          video.removeEventListener('seeked', onSeeked)

          ctx.drawImage(video, 0, 0, 224, 224)
          canvas.toBlob((blob) => {
            if (blob) frames.push(blob)
            currentTime += interval
            captureNext()
          }, 'image/jpeg', 0.85)
        })
      }

      captureNext()
    }
  })
}