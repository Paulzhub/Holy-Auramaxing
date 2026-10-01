export interface CspOptions {
  nonce: string;
  isDev: boolean;
  /** Add upgrade-insecure-requests (only meaningful when served over HTTPS). */
  upgradeInsecure: boolean;
  /** Supabase project URL, allowed for fetch and realtime websockets. */
  supabaseUrl?: string;
}

/** A fresh, unguessable nonce for each request (128 bits, base64). */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export const allowedStyleAttributeHashes = [
  "'sha256-MtxTLcyxVEJFNLEIqbVTaqR4WWr0+lYSZ78AzGmNsuA='",
  "'sha256-PhrR5O1xWiklTp5YfH8xWeig83Y/rhbrdb5whLn1pSg='",
];

export function buildCsp({ nonce, isDev, upgradeInsecure, supabaseUrl }: CspOptions): string {
  const connect = ["'self'"];
  if (supabaseUrl) {
    const url = new URL(supabaseUrl);
    connect.push(url.origin, `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`);
  }
  if (isDev) connect.push("ws:");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic' lets nonced Next.js chunks load their own children.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // In dev, Next injects styles without a nonce; a nonce would disable 'unsafe-inline'.
    "style-src": ["'self'", ...(isDev ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`])],
    // Inline style *attributes* are blocked except these exact values, which
    // Radix primitives render on the server (hashes of "outline:none" and
    // "animation-duration:0s"). Add a hash here only after reviewing it.
    "style-src-attr": isDev ? ["'unsafe-inline'"] : ["'unsafe-hashes'", ...allowedStyleAttributeHashes],
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'"],
    "connect-src": connect,
    "manifest-src": ["'self'"],
    "worker-src": ["'self'"],
    "media-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
  };

  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (upgradeInsecure) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}
