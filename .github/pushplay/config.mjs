import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// In a game repo the kit carries its own copy of brand.json; in the launcher monorepo it reads
// the shared one. Either way, names never appear in this code.
const vendored = join(import.meta.dirname, 'brand.json')
const source = join(import.meta.dirname, '../../shared/src/brand.json')
export const brand = JSON.parse(readFileSync(existsSync(vendored) ? vendored : source, 'utf8'))

/**
 * Bumped whenever the kit's files change (kit-lock.json holds their hash; a test enforces the bump).
 * ci.mjs writes it into the release index, so the launcher can tell a repo its kit is outdated.
 */
export const KIT_VERSION = 12
/**
 * Runtime modules copied into every game; `update-kit` replaces them by this header. The number
 * after `v` is the KIT_VERSION that shipped the file, so a game folder says which kit it carries.
 */
export const RUNTIME_HEADER = `// ${brand.slug} runtime v`
/** Matches the header whatever the product was called when the file was written. */
export const RUNTIME_HEADER_RE = /^\/\/ \S+ runtime v/
export const RUNTIME_FILES = ['input.js', 'menu.js', 'fit.js', 'audio.js', 'save.js', 'settings.js', 'prompts.js', 'touch.js']
/** Party games' runtime modules (templates/party), refreshed the same way in games that have party.js. */
export const PARTY_RUNTIME_FILES = ['party.js', 'party-lobby.js', 'qr.js', 'controller.js']
/** Online games' runtime modules (templates/online), refreshed in games that have net.js (party games too: party.js builds on net.js). */
export const ONLINE_RUNTIME_FILES = ['net.js', 'lobby.js']
/** Per-game ignore list (one glob per line) for files that are never shipped. */
export const IGNORE_FILE = `.${brand.slug}ignore`

/** Current manifest name first, then names from before any rename. */
export const MANIFEST_FILES = brand.manifestFiles
export const MANIFEST_FILE = MANIFEST_FILES[0]
export const RELEASE_TAG = brand.releaseTag
/** Pushes to the `beta` branch publish here instead: the game's beta channel, with its own index. */
export const BETA_RELEASE_TAG = brand.betaReleaseTag ?? `${brand.slug}-beta`
export const BETA_BRANCH = 'beta'

/**
 * The release a push publishes to: the default branch's builds are the stable channel, the `beta`
 * branch's the beta channel. Other branches only build and check (null).
 */
export function releaseTagFor(branch, defaultBranch) {
  if (branch === defaultBranch) return RELEASE_TAG
  if (branch === BETA_BRANCH) return BETA_RELEASE_TAG
  return null
}
export const INDEX_ASSET = brand.indexAsset

/** Where the kit lives inside a game repo, and its workflow. */
export const KIT_DIR = `.github/${brand.slug}`
export const WORKFLOW_FILE = `.github/workflows/${brand.slug}.yml`

/** Collection repos keep one game per folder here; single-game repos have the manifest at the root. */
export const GAMES_DIR = 'games'

/** The Steam Deck's screen. Games are checked (and screenshotted) at this size. */
export const VIEWPORT = { width: 1280, height: 800 }

/** Art sizes in px, from brand.json (the launcher shows the cover at about 216×150 and the hero at 1280×300). */
export const ART = brand.art

/** How long the headless check lets a game run before judging it. */
export const CHECK_RUN_MS = 3000
/** A second, denser 16:9 window the check also opens (Legion Go class screens and launcher zoom), small enough for a software GPU in CI. */
export const VIEWPORT_DENSE = { width: 1280, height: 720, deviceScaleFactor: 2 }

/**
 * The phone pass (games with "phone" in their manifest): a 6.1" phone, touch only, at 3× pixels.
 * The logical spaces are 720×1280 (portrait) and 1280×720 (landscape); see fit.js.
 */
export const VIEWPORT_PHONE = {
  portrait: { width: 390, height: 844, deviceScaleFactor: 3 },
  landscape: { width: 844, height: 390, deviceScaleFactor: 3 }
}
/** Smallest text a phone game may draw, in game units of a 720-wide (short side) space: about 4.5 mm on a 6.1" phone. */
export const PHONE_MIN_TEXT_PX = 32

/** Online games: the hosted relay (wss://), and the port of the local one `npm run dev` starts. */
export const RELAY_URL = brand.relayUrl ?? ''
export const LOCAL_RELAY_PORT = 5174
/** The two-copy online check: how long the copies get to meet, and how long they then play. */
export const NET_MEET_MS = 10_000
export const NET_PLAY_MS = 3000
/** Above this, the check warns that a game sends more than it needs to (bytes/s through the relay). */
export const NET_WARN_BYTES_PER_SEC = 20 * 1024

/** Minimum description length, so the library always has something useful to show. */
export const MIN_DESCRIPTION = 20

/**
 * Fonts available to art files by name (injected when art is rendered, so text looks the same
 * on every machine). family → [fontsource package, weights].
 */
export const ART_FONTS = {
  'Chakra Petch': ['chakra-petch', [600, 700]],
  Rubik: ['rubik', [400, 700, 900]],
  Bungee: ['bungee', [400]],
  'Lilita One': ['lilita-one', [400]],
  'Press Start 2P': ['press-start-2p', [400]]
}
