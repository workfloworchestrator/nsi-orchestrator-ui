import { JWT } from 'next-auth/jwt';

// Seconds before expiry to refresh, while the refresh token, which may live no longer than the
// access token, is still valid.
export const REFRESH_MARGIN_SECONDS = 300;

// A failed refresh is retried after this many seconds, not on every request.
export const REFRESH_RETRY_SECONDS = 30;

// Set on the session when an access token expired without being renewed: the library signs in again.
export const REFRESH_ERROR = 'RefreshAccessTokenError';

export const getCurrentDateInSeconds = () => Math.floor(Date.now() / 1000);

export const calculateExpirationDate = (
    expiresIn?: number | string,
    now = getCurrentDateInSeconds(),
) => {
    // Some providers send expires_in as a string.
    const seconds = Number(expiresIn);
    return seconds ? now + seconds : undefined;
};

// Capped at a tenth of the lifetime, so short-lived tokens are not refreshed on every request.
export const calculateRefreshDate = (
    expiresAt?: number,
    now = getCurrentDateInSeconds(),
) => {
    if (!expiresAt) {
        return undefined;
    }

    const margin = Math.min(
        REFRESH_MARGIN_SECONDS,
        Math.floor((expiresAt - now) / 10),
    );
    return expiresAt - Math.max(0, margin);
};

export const accessTokenTimes = (
    expiresAt?: number,
    now = getCurrentDateInSeconds(),
) => ({
    accessTokenExpiresAt: expiresAt,
    accessTokenRefreshAt: calculateRefreshDate(expiresAt, now),
});

// Cookies from before the refresh date existed fall back to the expiry.
const refreshDate = (token: JWT) =>
    token.accessTokenRefreshAt ?? token.accessTokenExpiresAt;

export const needsRefresh = (token: JWT, now = getCurrentDateInSeconds()) => {
    const refreshAt = refreshDate(token);
    return !(typeof refreshAt === 'number' && now < refreshAt);
};

export const accessTokenState = (
    token: JWT,
    now = getCurrentDateInSeconds(),
) => {
    const expiresAt = token.accessTokenExpiresAt;
    if (typeof expiresAt !== 'number') {
        return 'unknown';
    }

    return now < expiresAt ? 'valid' : 'expired';
};

// After a failed refresh, wait before the next attempt, but not past the expiry. An expired token
// waits too, so a provider that is down is not called on every request.
export const retryLater = (
    token: JWT,
    now = getCurrentDateInSeconds(),
): JWT => {
    const expiresAt = token.accessTokenExpiresAt;
    if (typeof expiresAt !== 'number') {
        return token;
    }

    const retryAt = now + REFRESH_RETRY_SECONDS;
    return {
        ...token,
        accessTokenRefreshAt:
            now < expiresAt ? Math.min(retryAt, expiresAt) : retryAt,
    };
};

// The library keeps a fetched session until shortly before the date the session reports, and only
// then asks the server, the one place a refresh happens. The refresh date makes it ask in time.
export const sessionExpiry = (token: JWT) =>
    refreshDate(token) as number | undefined;

// An expired access token that has a refresh token was not renewed: the library signs in again.
export const sessionError = (token: JWT, now = getCurrentDateInSeconds()) =>
    token.refreshToken && accessTokenState(token, now) === 'expired'
        ? REFRESH_ERROR
        : undefined;
