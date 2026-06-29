import * as tf from '@tensorflow/tfjs'

/**
 * Load a Blob as an HTMLImageElement.
 * @param {Blob} blob
 */
export function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load image.'))
    }
    img.src = url
  })
}

/**
 * Resize pixel data to a 224×224 batch tensor for MobileNet.
 * @param {HTMLVideoElement | HTMLImageElement | HTMLCanvasElement} source
 */
export function sourceToFrameTensor(source) {
  return tf.tidy(() => {
    const img = tf.browser.fromPixels(source)
    const resized = tf.image.resizeBilinear(img, [224, 224])
    return resized.expandDims(0)
  })
}

/**
 * @param {Blob} blob
 */
export async function blobToFrameTensor(blob) {
  const img = await loadImageFromBlob(blob)
  return sourceToFrameTensor(img)
}

