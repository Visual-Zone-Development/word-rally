// Image providers, in the order they're picked when several keys are set (ART_PROVIDER overrides).
// Each exports name, keyVar, model, nativeAlpha and generate({ prompt, size, transparent, quality }) → PNG Buffer.
import * as openai from './openai.mjs'
import * as gemini from './gemini.mjs'
import * as replicate from './replicate.mjs'

export default [openai, gemini, replicate]
