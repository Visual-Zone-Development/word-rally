// Replicate (FLUX and many others). Key: REPLICATE_API_TOKEN. Pick the model with
// REPLICATE_IMAGE_MODEL ("owner/name"). No alpha: transparent assets get a flat key colour.
export const name = 'replicate'
export const keyVar = 'REPLICATE_API_TOKEN'
export const model = process.env.REPLICATE_IMAGE_MODEL || 'black-forest-labs/flux-1.1-pro'
export const nativeAlpha = false

const aspect = (size) => {
  const [w, h] = size.split('x').map(Number)
  return w > h ? '3:2' : w < h ? '2:3' : '1:1'
}
const headers = () => ({ authorization: `Bearer ${process.env[keyVar]}`, 'content-type': 'application/json' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function generate({ prompt, size }) {
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: { ...headers(), prefer: 'wait=60' },
    body: JSON.stringify({ input: { prompt, aspect_ratio: aspect(size), output_format: 'png' } })
  })
  if (!res.ok) throw Object.assign(new Error(`Replicate ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: res.status })
  let p = await res.json()
  for (let i = 0; i < 60 && !['succeeded', 'failed', 'canceled'].includes(p.status); i++) {
    await sleep(2000)
    p = await (await fetch(p.urls.get, { headers: headers() })).json()
  }
  if (p.status !== 'succeeded') throw new Error(`Replicate prediction ${p.status}: ${p.error ?? 'timed out'}`)
  const url = Array.isArray(p.output) ? p.output[0] : p.output
  const img = await fetch(url)
  if (!img.ok) throw new Error(`Replicate image download ${img.status}`)
  return Buffer.from(await img.arrayBuffer())
}
