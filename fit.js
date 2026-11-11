// pushplay runtime v11 — replaced by `npm run update-kit`; don't edit, extend from game.js.
//
// Fits a fixed-size drawing space (1280×800 by default: the Steam Deck) into any window and
// keeps it centred with letterbox bars, at up to 2× device pixels so text stays sharp on dense
// screens (Legion Go, launcher zoom, Retina). Sizes update on resize; draw in w×h units always.
//
//   const fit = fitCanvas(canvas, { w: 1280, h: 800 })
//   const ctx = fit.ctx                        // transform already set; just draw at 1280×800
//   fit.scale, fit.dpr                         // current fit, for anything sized in CSS pixels
//
// Phone games use the phone spaces instead: { w: 720, h: 1280 } (portrait) or { w: 1280, h: 720 }
// (landscape; pass the same w and h to input.attach), and read how far the phone's notch, rounded
// corners and home bar reach into the canvas:
//   fit.safe                                   // { top, right, bottom, left } in game units: keep HUD and buttons inside
// It updates on resize and rotation (read it each frame, or in fit.onResize). On a Deck or PC it is
// all zeros. fit.insets is the same object, by its other name.
// { orientation: 'portrait' | 'landscape' } asks the browser to lock the screen that way; it is a
// request (browsers grant it in fullscreen, the mobile app always), so lay out for fit.w×fit.h
// regardless. fit.orientation says how the screen is really held.
//
// Fill the whole screen: { fill: true } makes w×h the *smallest* space the game gets. The canvas
// covers the window with no bars, and fit.w / fit.h grow to the screen's shape in game units: a
// tall phone gets a taller space (720×1604 on a 20:9 phone for { w: 720, h: 1280 }), a tablet a
// wider one. Never stretched: one unit is the same size both ways. Read fit.w and fit.h each frame
// (or in fit.onResize), lay out from the edges, and keep anything that decides difficulty inside
// the w×h you asked for, so a bigger screen sees more of the world but never gets an easier game.
//
// Pixel art: { integer: true } snaps the scale to whole multiples (or 1/n) and turns smoothing off.
// WebGL / three.js: create the renderer first, `renderer.setSize(1280, 800, false)`, then
// `fitCanvas(renderer.domElement, { maxDpr: 1 })`. A canvas that already has a WebGL context
// keeps its drawing buffer (three.js owns it); fitCanvas only sets its CSS size, position and
// the letterbox, and reports scale/dpr in fit.onResize(cb) if you want to resize the renderer.

const INSET_SIDES = ['top', 'right', 'bottom', 'left']

export function fitCanvas(canvas, { w = 1280, h = 800, maxDpr = 2, integer = false, letterbox = '#000', context = '2d', buffer, orientation, fill = false } = {}) {
  // getContext('2d') returns null on a canvas that already has a WebGL context.
  const ctx = context === '2d' ? canvas.getContext('2d') : null
  const ownsBuffer = buffer ?? ctx !== null
  const listeners = new Set()
  const probe = insetProbe()
  const fit = {
    /** The drawing space in game units: w×h, or with fill, at least w×h and the screen's shape. */
    w,
    h,
    /** The smallest space, as asked for: with fill, keep what decides difficulty inside it. */
    minW: w,
    minH: h,
    fill,
    scale: 1,
    dpr: 1,
    /** The 2D context with its transform set, or null for a WebGL canvas. */
    ctx,
    /** Drawn width/height in CSS pixels and the canvas' offset from the window's top-left. */
    cssWidth: w,
    cssHeight: h,
    left: 0,
    top: 0,
    /** Safe-area insets (notch, rounded corners, home bar) over the canvas, in game units: keep HUD and buttons inside them. */
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    /** How the screen is held right now: 'portrait' or 'landscape'. */
    orientation: 'landscape',
    onResize(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    /** Window coordinates → game coordinates (input.attach does this for you). */
    toGame(clientX, clientY) {
      return { x: (clientX - fit.left) / fit.scale, y: (clientY - fit.top) / fit.scale }
    },
    resize() {
      let scale = Math.min(innerWidth / w, innerHeight / h) || 1
      if (integer) scale = scale >= 1 ? Math.floor(scale) : 1 / Math.ceil(1 / scale)
      const dpr = Math.min(devicePixelRatio || 1, maxDpr)
      fit.scale = scale
      fit.dpr = dpr
      // With fill the space grows to the window's shape (whole units, so nothing is cut off).
      fit.w = fill ? Math.max(w, Math.floor(innerWidth / scale)) : w
      fit.h = fill ? Math.max(h, Math.floor(innerHeight / scale)) : h
      fit.cssWidth = fit.w * scale
      fit.cssHeight = fit.h * scale
      fit.left = Math.round((innerWidth - fit.cssWidth) / 2)
      fit.top = Math.round((innerHeight - fit.cssHeight) / 2)
      fit.orientation = innerHeight > innerWidth ? 'portrait' : 'landscape'
      if (ownsBuffer) {
        canvas.width = Math.round(fit.w * scale * dpr)
        canvas.height = Math.round(fit.h * scale * dpr)
      }
      Object.assign(canvas.style, {
        position: 'absolute',
        left: `${fit.left}px`,
        top: `${fit.top}px`,
        width: `${fit.cssWidth}px`,
        height: `${fit.cssHeight}px`,
        margin: '0',
        imageRendering: integer ? 'pixelated' : ''
      })
      if (ctx) {
        // Assigning canvas.width reset the context: drawing stays in w×h units.
        ctx.setTransform(canvas.width / fit.w, 0, 0, canvas.height / fit.h, 0, 0)
        ctx.imageSmoothingEnabled = !integer
      }
      // The letterbox bars absorb an inset first; only what reaches the canvas counts, in game units.
      const css = readInsets(probe)
      const bars = { left: fit.left, right: innerWidth - fit.left - fit.cssWidth, top: fit.top, bottom: innerHeight - fit.top - fit.cssHeight }
      for (const side of INSET_SIDES) fit.safe[side] = Math.max(0, css[side] - Math.max(0, bars[side])) / scale
      for (const cb of listeners) cb(fit)
    }
  }
  fit.insets = fit.safe
  // touch.js finds the safe area through the canvas input.attach was given.
  canvas.__fit = fit
  if (typeof document !== 'undefined' && document.body) {
    document.body.style.background = letterbox
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'
  }
  if (!canvas.__fitInstalled) {
    canvas.__fitInstalled = true
    addEventListener('resize', () => fit.resize())
    // Rotating a phone fires orientationchange before the new size is known; measure again after.
    addEventListener('orientationchange', () => setTimeout(() => fit.resize(), 50))
    globalThis.screen?.orientation?.addEventListener?.('change', () => fit.resize())
  }
  if (orientation) lockOrientation(orientation)
  fit.resize()
  return fit
}

/**
 * A hidden element whose padding is the browser's safe-area insets (env(safe-area-inset-*)), so
 * they can be read as numbers. Browsers without them report 0. Needs `viewport-fit=cover` in the
 * page's viewport meta tag (the starter's index.html has it).
 */
function insetProbe() {
  if (typeof document === 'undefined' || !document.body || typeof getComputedStyle !== 'function') return null
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' + INSET_SIDES.map((s) => `padding-${s}:env(safe-area-inset-${s},0px)`).join(';')
  document.body.appendChild(el)
  return el
}

/** The probe's padding in CSS pixels: { top, right, bottom, left }. */
function readInsets(probe) {
  const out = { top: 0, right: 0, bottom: 0, left: 0 }
  if (!probe) return out
  const style = getComputedStyle(probe)
  for (const side of INSET_SIDES) out[side] = parseFloat(style.getPropertyValue(`padding-${side}`)) || 0
  return out
}

/**
 * Ask to lock the screen to 'portrait' or 'landscape'. Never throws: browsers refuse outside
 * fullscreen and desktops have no orientation to lock, and the game lays out for w×h either way.
 */
export function lockOrientation(orientation) {
  try {
    const result = globalThis.screen?.orientation?.lock?.(orientation)
    if (result && typeof result.catch === 'function') result.catch(() => {})
  } catch {
    /* not supported here */
  }
}
