// Preloaded by generate.test.mjs (node --import): replaces fetch so no test ever reaches a paid API.
// Every call is announced on stdout and answered with a non-retryable 400.
globalThis.fetch = async (url) => {
  console.log(`FAKE-FETCH ${url}`)
  return new Response('stubbed by the test', { status: 400 })
}
