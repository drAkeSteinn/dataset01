import ZAI from 'z-ai-web-dev-sdk';

let zaiInstance: ZAI | null = null;
let zaiInitPromise: Promise<ZAI> | null = null;

/**
 * Get or initialize the ZAI SDK singleton.
 * Uses lazy initialization with promise caching to avoid multiple inits.
 */
export async function getZAI(): Promise<ZAI> {
  if (zaiInstance) {
    return zaiInstance;
  }

  if (!zaiInitPromise) {
    zaiInitPromise = ZAI.create().then((instance) => {
      zaiInstance = instance;
      return instance;
    });
  }

  return zaiInitPromise;
}
