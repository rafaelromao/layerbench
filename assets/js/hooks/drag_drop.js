// Drag a key onto another key to swap their bindings (Edit view). Pointer-based so it works on touch.
const DragDrop = {
  mounted() {
    this.from = null
    this.ghost = null
    const svg = this.el
    const keyOf = (target) => {
      const g = target && target.closest ? target.closest('g[data-key]') : null
      return g ? g.dataset.key : null
    }
    this.onDown = (e) => {
      const key = keyOf(e.target)
      if (!key) return
      this.from = key
      this.moved = false
      svg.setPointerCapture && svg.setPointerCapture(e.pointerId)
    }
    this.onMove = (e) => {
      if (!this.from) return
      this.moved = true
      svg.classList.add('lm-dragging')
      const over = document.elementFromPoint(e.clientX, e.clientY)
      const key = keyOf(over)
      svg.querySelectorAll('g[data-key].lm-drop-target').forEach((el) => el.classList.remove('lm-drop-target'))
      if (key && key !== this.from) {
        const g = svg.querySelector(`g[data-key="${key}"]`)
        if (g) g.classList.add('lm-drop-target')
      }
    }
    this.onUp = (e) => {
      if (!this.from) return
      const over = document.elementFromPoint(e.clientX, e.clientY)
      const to = keyOf(over)
      svg.classList.remove('lm-dragging')
      svg.querySelectorAll('g[data-key].lm-drop-target').forEach((el) => el.classList.remove('lm-drop-target'))
      if (this.moved && to && to !== this.from) {
        this.pushEvent('swap', { from: this.from, to })
        e.preventDefault()
        e.stopPropagation()
      }
      this.from = null
    }
    svg.addEventListener('pointerdown', this.onDown)
    svg.addEventListener('pointermove', this.onMove)
    svg.addEventListener('pointerup', this.onUp)
    svg.addEventListener('pointercancel', this.onUp)
  },
  destroyed() {
    const svg = this.el
    svg.removeEventListener('pointerdown', this.onDown)
    svg.removeEventListener('pointermove', this.onMove)
    svg.removeEventListener('pointerup', this.onUp)
    svg.removeEventListener('pointercancel', this.onUp)
  },
}

const ScrollTo = {
  mounted() {
    this.handleEvent('scroll_to', ({ id }) => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  },
}

export default { DragDrop, ScrollTo }
