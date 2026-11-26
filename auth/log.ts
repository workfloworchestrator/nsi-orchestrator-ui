import { createHash } from 'crypto';

// One line per auth event: `auth event=refresh outcome=ok user=3f9a1c02`. Never pass tokens, cookies
// or profile data: fields are limited to outcomes, numbers, standard error codes and `userId`.
type Fields = Record<string, string | number | undefined>;

const quote = (value: string) =>
    /[\s"=]/.test(value) ? JSON.stringify(value) : value;

export const logAuth = (
    event: string,
    fields: Fields,
    level: 'info' | 'warn' = 'info',
) => {
    const pairs = Object.entries(fields)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${quote(String(value))}`);

    // eslint-disable-next-line no-console
    console[level](['auth', `event=${event}`, ...pairs].join(' '));
};

// A short hash tells one user's lines apart without writing the identifier itself to the logs.
export const userId = (sub?: string) =>
    sub
        ? createHash('sha256').update(sub).digest('hex').slice(0, 8)
        : undefined;

export class TokenEndpointError extends Error {
    constructor(
        readonly status: number,
        readonly code?: string,
    ) {
        super(`Token endpoint returned ${status}`);
    }
}

// Only the standard error code is read: descriptions can echo request parameters.
export const readOAuthErrorCode = async (response: Response) => {
    const body = await response.json().catch(() => undefined);
    const code = body?.error;
    return typeof code === 'string' && /^[a-z_]+$/.test(code)
        ? code
        : undefined;
};

// Only the name is logged: messages can carry request details. Checked by shape, as errors from
// fetch and AbortSignal do not always share this module's `Error`.
const errorName = (error: unknown) => {
    const name = (error as { name?: unknown } | null)?.name;
    return typeof name === 'string' && /^\w{1,40}$/.test(name)
        ? name
        : 'unknown';
};

export const failureFields = (error: unknown): Fields =>
    error instanceof TokenEndpointError
        ? { status: error.status, error: error.code }
        : { reason: errorName(error) };
