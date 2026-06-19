/** @typedef {{ label: string, note?: string }} ItemMeta */

/** @type {{ name: string, confidence: number } | null} */
export let currentItem = null

export function setCurrentItem(name, confidence = 0) {
  currentItem = { name, confidence }
  window.dispatchEvent(new CustomEvent('item-identified', { detail: currentItem }))
}

export function clearCurrentItem() {
  currentItem = null
}