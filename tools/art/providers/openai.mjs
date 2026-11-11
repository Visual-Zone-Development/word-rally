// OpenAI Images API. Key: OPENAI_API_KEY. Supports transparent backgrounds natively.
export const name = 'openai'
export const keyVar = 'OPENAI_API_KEY'
export const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst'
export const nativeAlpha = true
const SIZES = ['1024x1024', '1536x1024', '1024x1536']

export async function generate({ prompt, size, transparent, quality }) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env[keyVar]}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      size: SIZES.includes(size) ? size : '1024x1024',
      quality,
      output_format: 'png',
      background: transparent ? 'transparent' : 'opaque',
      n: 1
    })
  })
  if (!res.ok) throw Object.assign(new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: res.status })
  const json = await res.json()
  return Buffer.from(json.data[0].b64_json, 'base64')
}
