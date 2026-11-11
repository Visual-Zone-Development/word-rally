// Gemini native image generation. Key: GEMINI_API_KEY. (Imagen was shut down on the Gemini API in
// August 2026, so this uses a Gemini image model.) No alpha: transparent assets get a flat key colour.
export const name = 'gemini'
export const keyVar = 'GEMINI_API_KEY'
export const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'
export const nativeAlpha = false

const aspect = (size) => {
  const [w, h] = size.split('x').map(Number)
  return w > h ? '3:2' : w < h ? '2:3' : '1:1'
}

export async function generate({ prompt, size }) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env[keyVar], 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect(size) } }
    })
  })
  if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: res.status })
  const json = await res.json()
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
  if (!part) throw new Error(`Gemini returned no image (${json.candidates?.[0]?.finishReason ?? 'no candidates'})`)
  return Buffer.from(part.inlineData.data, 'base64')
}
