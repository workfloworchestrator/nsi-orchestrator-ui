/** @jest-environment node */
import { JWT } from 'next-auth/jwt';

import { userId } from '@/auth/log';
import { REUSE_WINDOW_MS } from '@/auth/shareRefresh';
import { REFRESH_ERROR } from '@/auth/tokenLifetime';

// The mock IdP issues single-use refresh tokens: a refresh token works once, then it is gone.

const mockEnv: Record<string, string> = {
    OAUTH2_ACTIVE: 'true',
    OAUTH2_CLIENT_ID: 'client',
    OAUTH2_CLIENT_SECRET: 'secret',
    NEXTAUTH_PROVIDER_ID: 'idp',
    NEXTAUTH_PROVIDER_NAME: 'IdP',
    OIDC_CONF_FULL_WELL_KNOWN_URL:
        'https://idp.test/.well-known/openid-configuration',
};

jest.mock('@orchestrator-ui/orchestrator-ui-components', () => ({
    getEnvironmentVariables: () => mockEnv,
}));

const CONCURRENT_REQUESTS = 13;
const TOKEN_ENDPOINT = 'https://idp.test/token';
const NOW = 1_800_000_000;

const startIdp = (
    validRefreshTokens: string[],
    expiresIn: number | string = 3600,
    rotates = true,
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
            // Descriptions can echo the request, so the logs must not carry them.
            return Response.json(
                {
                    error: 'invalid_grant',
                    error_description: `Refresh token ${refreshToken} is not valid`,
                },
                { status: 400, statusText: 'Bad Request' },
            );
        }

        issued += 1;
        const rotated = rotates ? `refresh-${issued}` : undefined;
        valid.add(rotated ?? refreshToken);
        return Response.json({
            access_token: `access-${issued}`,
            refresh_token: rotated,
            expires_in: expiresIn,
        });
    });

    return { tokenRequests, accept: (token: string) => valid.add(token) };
};

const loadAuthOptions = async () => {
    // A fresh module per test: the shared refreshes are module state.
    jest.resetModules();
    const { authOptions } = await import('@/pages/api/auth/[...nextauth]');
    return authOptions;
};

const jwtCallback = (options: Awaited<ReturnType<typeof loadAuthOptions>>) => {
    const jwt = options.callbacks!.jwt!;

    return (token: JWT, account?: Record<string, unknown>) =>
        jwt({ token, account } as Parameters<typeof jwt>[0]);
};

const expiredToken = (refreshToken?: string): JWT => ({
    accessToken: 'access-0',
    refreshToken,
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) - 10,
});

describe('jwt callback refresh', () => {
    let authOptions: Awaited<ReturnType<typeof loadAuthOptions>>;
    let jwt: ReturnType<typeof jwtCallback>;
    let warnings: jest.SpyInstance;
    let infos: jest.SpyInstance;

    // The page load: every session request carries the same token.
    const burst = (token: JWT) =>
        Promise.all(
            Array.from({ length: CONCURRENT_REQUESTS }, () => jwt(token)),
        );
    const allEqual = (expected: unknown) =>
        Array(CONCURRENT_REQUESTS).fill(expected);

    beforeEach(async () => {
        warnings = jest.spyOn(console, 'warn').mockImplementation();
        infos = jest.spyOn(console, 'info').mockImplementation();
        authOptions = await loadAuthOptions();
        jwt = jwtCallback(authOptions);
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('refreshes once for concurrent requests with the same expired token', async () => {
        // A frozen clock: refresh_in is derived from more than one reading of it.
        jest.useFakeTimers();
        const idp = startIdp(['refresh-0']);

        const results = await burst(expiredToken('refresh-0'));

        expect(idp.tokenRequests).toEqual(['refresh-0']);
        expect(
            jest.mocked(fetch).mock.calls.map(([, init]) => init?.signal),
        ).toEqual([expect.any(AbortSignal), expect.any(AbortSignal)]);
        expect(warnings).not.toHaveBeenCalled();
        expect(infos).toHaveBeenCalledTimes(1);
        expect(infos).toHaveBeenCalledWith(
            'auth event=refresh outcome=ok access_token=expired refresh_in=3300',
        );
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
        // The status and the error code, not the description that echoes the refresh token.
        expect(warnings).toHaveBeenCalledTimes(1);
        expect(warnings).toHaveBeenCalledWith(
            'auth event=refresh outcome=failed access_token=expired status=400 error=invalid_grant',
        );
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
        expect(warnings).toHaveBeenCalledTimes(1);
        expect(warnings).toHaveBeenCalledWith(
            'auth event=refresh outcome=failed access_token=expired reason=TimeoutError',
        );
        expect(results).toEqual(allEqual(expect.objectContaining(token)));
    });

    it.each([
        { why: 'failing', status: 502, body: 'Bad Gateway' },
        { why: 'unreadable', status: 200, body: 'not json' },
    ])(
        'logs a $why discovery document by its status',
        async ({ status, body }) => {
            jest.spyOn(global, 'fetch').mockImplementation(
                async () => new Response(body, { status }),
            );

            await jwt(expiredToken('refresh-0'));

            expect(warnings).toHaveBeenCalledWith(
                `auth event=refresh outcome=failed access_token=expired reason=discovery status=${status}`,
            );
        },
    );

    it('keeps the refresh token when the provider does not rotate it', async () => {
        startIdp(['refresh-0'], 3600, false);

        const refreshed = await jwt(expiredToken('refresh-0'));

        expect(refreshed).toMatchObject({
            accessToken: 'access-1',
            refreshToken: 'refresh-0',
        });
    });

    it('keeps the new tokens when the log line cannot be written', async () => {
        infos.mockImplementation(() => {
            throw new Error('write EPIPE');
        });
        const idp = startIdp(['refresh-0']);

        const refreshed = await jwt(expiredToken('refresh-0'));

        expect(idp.tokenRequests).toEqual(['refresh-0']);
        expect(warnings).not.toHaveBeenCalled();
        expect(refreshed).toMatchObject({
            accessToken: 'access-1',
            refreshToken: 'refresh-1',
        });
    });

    it('does not contact the IdP without a refresh token', async () => {
        startIdp([]);
        const token = expiredToken();

        const results = await burst(token);

        expect(fetch).not.toHaveBeenCalled();
        expect(warnings).not.toHaveBeenCalled();
        expect(infos).not.toHaveBeenCalled();
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
        // Valid for 10 more minutes, but past its refresh date.
        const dueToken = (): JWT => ({
            ...expiredToken('refresh-0'),
            sub: 'subject-1',
            accessTokenExpiresAt: NOW + 600,
            accessTokenRefreshAt: NOW - 60,
        });
        const user = `user=${userId('subject-1')}`;

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
            expect(infos).toHaveBeenCalledWith(
                `auth event=refresh outcome=ok ${user} access_token=valid refresh_in=3300`,
            );
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

        it.each([
            { state: 'valid', expiresIn: 600 },
            { state: 'expired', expiresIn: -10 },
        ])(
            'waits before retrying a failed refresh of a $state access token',
            async ({ state, expiresIn }) => {
                const idp = startIdp([]);

                const failed = await jwt({
                    ...dueToken(),
                    accessTokenExpiresAt: NOW + expiresIn,
                });

                expect(failed).toMatchObject({
                    accessToken: 'access-0',
                    accessTokenRefreshAt: NOW + 30,
                });
                expect(warnings).toHaveBeenCalledTimes(1);
                expect(warnings).toHaveBeenCalledWith(
                    `auth event=refresh outcome=failed ${user} access_token=${state} status=400 error=invalid_grant`,
                );

                await jwt(failed);
                expect(idp.tokenRequests).toEqual(['refresh-0']);

                await jest.advanceTimersByTimeAsync(30_000);
                await jwt(failed);
                expect(idp.tokenRequests).toEqual(['refresh-0', 'refresh-0']);
            },
        );
    });

    describe('session', () => {
        const EXPIRED = 1;
        const NOT_EXPIRED = 4_000_000_000;
        const sessionFor = async (token: JWT) => {
            const session = authOptions.callbacks!.session!;

            return (await session({ session: {}, token } as Parameters<
                typeof session
            >[0])) as { accessTokenExpiresAt?: number; error?: string };
        };

        it('reports the refresh date, so the library asks again in time', async () => {
            const session = await sessionFor({
                accessTokenExpiresAt: NOW + 3600,
                accessTokenRefreshAt: NOW + 3300,
            });

            expect(session.accessTokenExpiresAt).toBe(NOW + 3300);
        });

        it.each([
            {
                why: 'an expired token with a refresh token',
                token: { accessTokenExpiresAt: EXPIRED, refreshToken: 'r' },
                error: REFRESH_ERROR,
            },
            {
                why: 'a token that has not expired',
                token: { accessTokenExpiresAt: NOT_EXPIRED, refreshToken: 'r' },
                error: undefined,
            },
            {
                why: 'an expired token without a refresh token',
                token: { accessTokenExpiresAt: EXPIRED },
                error: undefined,
            },
        ])('has error $error for $why', async ({ token, error }) => {
            expect((await sessionFor(token)).error).toBe(error);
        });
    });

    describe('sign-in and sign-out lines', () => {
        const account = {
            refresh_token: 'secret-refresh',
            expires_at: NOW + 3600,
        };

        beforeEach(() => {
            jest.useFakeTimers().setSystemTime(NOW * 1000);
        });

        afterEach(() => {
            delete mockEnv.NEXTAUTH_REQUIRED_GROUP;
        });

        it.each([
            { who: 'is not restricted', group: undefined, groups: [] },
            { who: 'has the required group', group: 'ops', groups: ['ops'] },
            { who: 'lacks the required group', group: 'ops', groups: ['dev'] },
        ])('logs a user who $who', async ({ group, groups }) => {
            if (group) {
                mockEnv.NEXTAUTH_REQUIRED_GROUP = group;
            }
            const signIn = (await loadAuthOptions()).callbacks!.signIn!;
            const params: Record<string, unknown> = {
                profile: { sub: 'subject-1', groups },
                account,
            };

            const allowed = await signIn(
                params as Parameters<typeof signIn>[0],
            );

            // The line carries a hash of the user, never the user or the token.
            const outcome = allowed ? 'ok' : 'denied';
            expect(allowed ? infos : warnings).toHaveBeenCalledWith(
                `auth event=signin outcome=${outcome} user=${userId('subject-1')} refresh_token=present expires_in=3600`,
            );
            expect(allowed ? warnings : infos).not.toHaveBeenCalled();
        });

        it('logs a sign-out by the hashed user', async () => {
            const signOut = (await loadAuthOptions()).events!.signOut!;

            await signOut({ token: { sub: 'subject-1' } } as Parameters<
                typeof signOut
            >[0]);

            expect(infos).toHaveBeenCalledWith(
                `auth event=signout user=${userId('subject-1')}`,
            );
        });
    });
});
