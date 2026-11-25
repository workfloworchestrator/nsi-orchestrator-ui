import { JWT } from 'next-auth/jwt';

// Single-use refresh tokens (EngineBlock) fail every refresh after the first, and a page load sends
// about a dozen session requests with the same expired token. Callers with the same refresh token
// share one refresh. Per process: keep one replica.

// Requests sent before the browser stored the new cookie still carry the old token.
export const REUSE_WINDOW_MS = 60_000;

const refreshes = new Map<string, Promise<JWT>>();

export const shareRefresh = (
    refreshToken: string,
    refresh: () => Promise<JWT>,
): Promise<JWT> => {
    const shared = refreshes.get(refreshToken);
    if (shared) {
        return shared;
    }

    const started = refresh();
    refreshes.set(refreshToken, started);

    // A rejection is dropped at once so the next request retries.
    const forget = () => refreshes.delete(refreshToken);
    started.then(() => setTimeout(forget, REUSE_WINDOW_MS).unref(), forget);

    return started;
};
