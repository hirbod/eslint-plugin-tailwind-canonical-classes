import { runAsWorker } from 'synckit';
import { __unstable__loadDesignSystem } from '@tailwindcss/node';

const designSystemCache = new Map<string, any>();

async function canonicalizeInWorker(
  cssContent: string,
  basePath: string,
  candidates: string[],
  options: { rem?: number } = {}
): Promise<string[]> {
  const cacheKey = basePath;
  
  let designSystem = designSystemCache.get(cacheKey);
  
  if (!designSystem) {
    designSystem = await __unstable__loadDesignSystem(cssContent, { base: basePath });
    designSystemCache.set(cacheKey, designSystem);
  }
  
  return designSystem.canonicalizeCandidates(candidates, options);
}

runAsWorker(canonicalizeInWorker);

