import { createHmac } from 'crypto';

// One line per auth event: `auth event=refresh outcome=ok user=3f9a1c02b7d4`. Never pass tokens,
// cookies or profile data: fields are limited to outcomes, numbers, standard error codes and `userId`.
type Fields = Record<string, string | number | undefined>;

const quote = (value: string) =>
    /[\s"=]/.test(value) ? JSON.stringify(value) : value;

// Only values of an expected shape reach the log: messages and descriptions can echo request data.
const allowlisted = (value: unknown, pattern: RegExp) =>
    typeof value === 'string' && pattern.test(value) ? value : undefined;

export const logAuth = (
    event: string,
    fields: Fields,
    level: 'info' | 'warn' = 'info',
) => {
    const pairs = Object.entries(fields)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${quote(String(value))}`);

    try {
        // eslint-disable-next-line no-console
        console[level](['auth', `event=${event}`, ...pairs].join(' '));
    } catch {
        // Logging must not fail the caller; a refresh has already used up the refresh token.
    }
};

// HMAC, not a plain hash: without the secret NextAuth uses, a guessable subject cannot be matched
// to its id.
export const userId = (sub?: string) =>
    sub
        ? createHmac(
              'sha256',
              process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? '',
          )
              .update(sub)
              .digest('hex')
              .slice(0, 12)
        : undefined;

export class TokenEndpointError extends Error {
    constructor(
        readonly status: number,
        readonly code?: string,
    ) {
        super(`Token endpoint returned ${status}`);
    }
}

export class DiscoveryError extends Error {
    constructor(readonly status: number) {
        super(`Discovery document returned ${status}`);
    }
}

// The standard error code, not the description.
export const readOAuthErrorCode = async (response: Response) => {
    const body = await response.json().catch(() => undefined);
    return allowlisted(body?.error, /^[a-z_]{1,40}$/);
};

// Checked by shape: errors from fetch and AbortSignal do not always share this module's `Error`.
const errorName = (error: unknown) =>
    allowlisted((error as { name?: unknown } | null)?.name, /^\w{1,40}$/) ??
    'unknown';

// System error codes such as ECONNREFUSED or CERT_HAS_EXPIRED say why a fetch failed.
const causeCode = (error: unknown) =>
    allowlisted(
        (error as { cause?: { code?: unknown } } | null)?.cause?.code,
        /^[A-Z][A-Z0-9_]{1,60}$/,
    );

export const failureFields = (error: unknown): Fields => {
    if (error instanceof TokenEndpointError) {
        return { status: error.status, error: error.code };
    }
    if (error instanceof DiscoveryError) {
        return { reason: 'discovery', status: error.status };
    }
    return { reason: errorName(error), cause: causeCode(error) };
};
