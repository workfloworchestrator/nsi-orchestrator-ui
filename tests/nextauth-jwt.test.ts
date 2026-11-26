/** @jest-environment node */
import { JWT } from 'next-auth/jwt';

import { REUSE_WINDOW_MS } from '@/auth/shareRefresh';

// The mock IdP issues single-use refresh tokens: a refresh token works once, then it is gone.

jest.mock('@orchestrator-ui/orchestrator-ui-components', () => ({
    getEnvironmentVariables: () => ({
        OAUTH2_ACTIVE: 'true',
        OAUTH2_CLIENT_ID: 'client',
        OAUTH2_CLIENT_SECRET: 'secret',
        NEXTAUTH_PROVIDER_ID: 'idp',
        NEXTAUTH_PROVIDER_NAME: 'IdP',
        OIDC_CONF_FULL_WELL_KNOWN_URL:
            'https://idp.test/.well-known/openid-configuration',
    }),
}));

const CONCURRENT_REQUESTS = 13;
const TOKEN_ENDPOINT = 'https://idp.test/token';

const startIdp = (
    validRefreshTokens: string[],
    expiresIn: number | string = 3600,
) => {
    const valid = new Set(validRefreshTokens);
    let issued = 0;
    const tokenRequests: string[] = [];

    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        if (String(input).endsWith('/.well-known/openid-configuration')) {
            return Response.json({ token_endpoint: TOKEN_ENDPOINT });
        }

        const refreshToken = new URLSearchParams(
            init?.body as URLSearchParams,
        ).get('refresh_token') as string;
        tokenRequests.push(refreshToken);

        if (!valid.delete(refreshToken)) {
            return new Response('{}', {
                status: 400,
                statusText: 'Bad Request',
            });
        }

        issued += 1;
        valid.add(`refresh-${issued}`);
        return Response.json({
            access_token: `access-${issued}`,
            refresh_token: `refresh-${issued}`,
            expires_in: expiresIn,
        });
    });

    return { tokenRequests, accept: (token: string) => valid.add(token) };
};

const loadJwtCallback = async () => {
    // A fresh module per test: the shared refreshes are module state.
    jest.resetModules();
    const { authOptions } = await import('@/pages/api/auth/[...nextauth]');
    const jwt = authOptions.callbacks!.jwt!;

    return (token: JWT, account?: Record<string, unknown>) =>
        jwt({ token, account } as Parameters<typeof jwt>[0]);
};

const expiredToken = (refreshToken?: string): JWT => ({
    accessToken: 'access-0',
    refreshToken,
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) - 10,
});

describe('jwt callback refresh', () => {
    let jwt: Awaited<ReturnType<typeof loadJwtCallback>>;
    let consoleError: jest.SpyInstance;

    // The page load: every session request carries the same token.
    const burst = (token: JWT) =>
        Promise.all(
            Array.from({ length: CONCURRENT_REQUESTS }, () => jwt(token)),
        );
    const allEqual = (expected: unknown) =>
        Array(CONCURRENT_REQUESTS).fill(expected);

    beforeEach(async () => {
        consoleError = jest.spyOn(console, 'error').mockImplementation();
        jwt = await loadJwtCallback();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('refreshes once for concurrent requests with the same expired token', async () => {
        const idp = startIdp(['refresh-0']);

        const results = await burst(expiredToken('refresh-0'));

        expect(idp.tokenRequests).toEqual(['refresh-0']);
        expect(
            jest.mocked(fetch).mock.calls.map(([, init]) => init?.signal),
        ).toEqual([expect.any(AbortSignal), expect.any(AbortSignal)]);
        expect(consoleError).not.toHaveBeenCalled();
        expect(results).toEqual(
            allEqual(
                expect.objectContaining({
                    accessToken: 'access-1',
                    refreshToken: 'refresh-1',
                }),
            ),
        );
    });

    it('gives requests that still carry the old cookie the same result for a while', async () => {
        jest.useFakeTimers();
        const idp = startIdp(['refresh-0']);

        await jwt(expiredToken('refresh-0'));
        await jest.advanceTimersByTimeAsync(REUSE_WINDOW_MS - 1000);
        const straggler = await jwt(expiredToken('refresh-0'));

        expect(idp.tokenRequests).toEqual(['refresh-0']);
        expect(straggler).toMatchObject({ refreshToken: 'refresh-1' });

        await jest.advanceTimersByTimeAsync(2000);
        const late = await jwt(expiredToken('refresh-0'));

        expect(idp.tokenRequests).toEqual(['refresh-0', 'refresh-0']);
        expect(late).toMatchObject({ refreshToken: 'refresh-0' });
    });

    it('refreshes separate sessions separately', async () => {
        const idp = startIdp(['refresh-a', 'refresh-b']);

        await Promise.all([
            jwt(expiredToken('refresh-a')),
            jwt(expiredToken('refresh-b')),
        ]);

        expect(idp.tokenRequests.sort()).toEqual(['refresh-a', 'refresh-b']);
    });

    it('shares a failed refresh between concurrent requests but retries later', async () => {
        const idp = startIdp([]);

        const failed = await burst(expiredToken('refresh-0'));

        expect(idp.tokenRequests).toEqual(['refresh-0']);
        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(failed).toEqual(
            allEqual(expect.objectContaining({ refreshToken: 'refresh-0' })),
        );

        idp.accept('refresh-0');
        const retried = await jwt(expiredToken('refresh-0'));

        expect(idp.tokenRequests).toEqual(['refresh-0', 'refresh-0']);
        expect(retried).toMatchObject({ refreshToken: 'refresh-1' });
    });

    it('keeps the session when the IdP cannot be reached', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(
            new DOMException('The operation timed out', 'TimeoutError'),
        );
        const token = expiredToken('refresh-0');

        // A rejection here would make NextAuth clear the session cookie.
        const results = await burst(token);

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(results).toEqual(allEqual(expect.objectContaining(token)));
    });

    it('does not contact the IdP without a refresh token', async () => {
        startIdp([]);
        const token = expiredToken();

        const results = await burst(token);

        expect(fetch).not.toHaveBeenCalled();
        expect(consoleError).not.toHaveBeenCalled();
        expect(results).toEqual(allEqual(token));
    });

    it('leaves a token that has not expired alone', async () => {
        startIdp(['refresh-0']);
        const token = {
            ...expiredToken('refresh-0'),
            accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 600,
        };

        expect(await jwt(token)).toEqual(token);
        expect(fetch).not.toHaveBeenCalled();
    });

    describe('refresh date', () => {
        const NOW = 1_800_000_000;
        // Valid for 10 more minutes, but past its refresh date.
        const dueToken = (): JWT => ({
            ...expiredToken('refresh-0'),
            accessTokenExpiresAt: NOW + 600,
            accessTokenRefreshAt: NOW - 60,
        });

        beforeEach(() => {
            jest.useFakeTimers().setSystemTime(NOW * 1000);
        });

        it('refreshes a valid token once its refresh date has passed', async () => {
            const idp = startIdp(['refresh-0'], '3600');

            const refreshed = await jwt(dueToken());

            expect(idp.tokenRequests).toEqual(['refresh-0']);
            expect(refreshed).toMatchObject({
                refreshToken: 'refresh-1',
                accessTokenExpiresAt: NOW + 3600,
                accessTokenRefreshAt: NOW + 3300,
            });
        });

        it('plans the first refresh when the user signs in', async () => {
            const signedIn = await jwt(
                {},
                {
                    access_token: 'access-0',
                    refresh_token: 'refresh-0',
                    expires_at: NOW + 3600,
                },
            );

            expect(signedIn).toMatchObject({
                accessTokenExpiresAt: NOW + 3600,
                accessTokenRefreshAt: NOW + 3300,
            });
        });

        it('keeps the valid access token and waits before retrying a failed early refresh', async () => {
            const idp = startIdp([]);

            const failed = await jwt(dueToken());

            expect(failed).toMatchObject({
                accessToken: 'access-0',
                accessTokenRefreshAt: NOW + 30,
            });
            expect(consoleError).toHaveBeenCalledTimes(1);

            await jwt(failed);
            expect(idp.tokenRequests).toEqual(['refresh-0']);

            await jest.advanceTimersByTimeAsync(30_000);
            await jwt(failed);
            expect(idp.tokenRequests).toEqual(['refresh-0', 'refresh-0']);
        });
    });
});
