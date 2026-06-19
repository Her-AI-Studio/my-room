import { currentItem } from './state.js'
import { checkOllama, ollamaGenerate, getOllamaConfig, saveOllamaConfig } from './ollama.js'

let ollamaOnline = false

const $ = (id) => document.getElementById(id)

export function initItemAssistant() {
  $('btn-ask')?.addEventListener('click', () => askQuestion())
  $('item-question')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') askQuestion()
  })

  document.querySelectorAll('[data-item-chip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.itemChip
      if ($('item-question')) $('item-question').value = q
      askQuestion(q)
    })
  })

  $('btn-save-ollama')?.addEventListener('click', () => {
    saveOllamaConfig($('ollama-base')?.value, $('ollama-model')?.value)
    updateOllamaStatus()
  })

  window.addEventListener('item-identified', () => {
    updateItemContext()
  })

  $('item-select')?.addEventListener('change', () => {
    const name = $('item-select').value
    if (name) updateItemContext(name)
  })

  updateOllamaStatus()
  if (currentItem) updateItemContext(currentItem.name)
}

export function populateItemSelect(classNames) {
  const sel = $('item-select')
  if (!sel) return
  const current = sel.value
  sel.innerHTML = '<option value="">Choose an item…</option>'
  for (const name of classNames) {
    const opt = document.createElement('option')
    opt.value = name
    opt.textContent = name
    sel.append(opt)
  }
  if (current && classNames.includes(current)) sel.value = current
}

function updateItemContext(name) {
  const display = $('item-display')
  if (display) display.textContent = name || '—'
  const messages = $('item-messages')
  if (messages) messages.innerHTML = ''
  if (name) {
    appendMessage('assistant', `You selected "${name}". Ask a question about it below.`)
  }
}

async function updateOllamaStatus() {
  const el = $('ollama-status')
  if (!el) return
  ollamaOnline = await checkOllama()
  el.textContent = ollamaOnline
    ? 'Ollama connected. You can ask questions about your items.'
    : 'Ollama not detected. Run: ollama serve'
  el.classList.toggle('is-online', ollamaOnline)
}

function buildChatPrompt(question, itemName) {
  return `You are a helpful assistant. The user identified an item called "${itemName}" in their room.
Answer the following question in 2-3 short sentences. No markdown.

Question: ${question}`
}

async function askQuestion(presetQuestion) {
  const input = $('item-question')
  const question = (presetQuestion || input?.value || '').trim()
  if (!question) return

  const itemName = $('item-display')?.textContent
  if (!itemName || itemName === '—') {
    appendMessage('assistant', 'Identify or select an item first.')
    return
  }

  appendMessage('user', question)
  if (input) input.value = ''

  if (ollamaOnline) {
    try {
      const reply = await ollamaGenerate(buildChatPrompt(question, itemName))
      appendMessage('assistant', reply)
      return
    } catch {
      appendMessage('assistant', 'Could not reach Ollama. Make sure it is running.')
    }
  } else {
    appendMessage('assistant', 'Ollama is not connected. Start it with: ollama serve')
  }
}

function appendMessage(role, text) {
  const box = $('item-messages')
  if (!box) return
  const div = document.createElement('div')
  div.className = `item-msg item-msg--${role}`
  div.textContent = text
  box.append(div)
  box.scrollTop = box.scrollHeight
}

export { updateOllamaStatus }