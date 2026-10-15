// One place for the local Remotion Studio address. remotion.config.ts pins the Studio to this
// port; the library links to it. Override the library link with VITE_REMOTION_STUDIO_URL when
// Studio runs elsewhere (for example `npm run studio -- --port 3100`).
export const STUDIO_PORT = 3000;

export const DEFAULT_STUDIO_URL = `http://localhost:${STUDIO_PORT}`;

export const resolveStudioUrl = (override?: string) => (override?.trim() ? override.trim().replace(/\/+$/, '') : DEFAULT_STUDIO_URL);

/** Deep link that opens a composition directly in Studio. */
export const studioCompositionUrl = (base: string, compositionId: string) => `${base}/${encodeURIComponent(compositionId)}`;
