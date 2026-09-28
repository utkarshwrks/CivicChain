// Node module hook (local rehearsal only): swap the Gemini + Pinata services
// for local fakes so the full UI flow can be exercised without API keys.
const FAKES = {
  '/services/ai.service.js': new URL('./fake-ai.mjs', import.meta.url).href,
  '/services/ipfs.service.js': new URL('./fake-ipfs.mjs', import.meta.url).href,
};
export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  for (const [suffix, fake] of Object.entries(FAKES)) {
    if (r.url.endsWith(suffix) && !context.parentURL?.includes('/test/harness/')) return { ...r, url: fake, shortCircuit: true };
  }
  return r;
}
