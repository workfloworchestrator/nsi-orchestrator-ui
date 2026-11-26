import NextAuth, { AuthOptions } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import { OAuthConfig } from 'next-auth/providers/oauth';

import {
    WfoSession,
    WfoUserProfile,
    getEnvironmentVariables,
} from '@orchestrator-ui/orchestrator-ui-components';

import {
    DiscoveryError,
    TokenEndpointError,
    failureFields,
    logAuth,
    readOAuthErrorCode,
    userId,
} from '@/auth/log';
import { shareRefresh } from '@/auth/shareRefresh';
import {
    accessTokenState,
    accessTokenTimes,
    calculateExpirationDate,
    getCurrentDateInSeconds,
    needsRefresh,
    retryLater,
} from '@/auth/tokenLifetime';

const {
    OAUTH2_ACTIVE,
    OAUTH2_CLIENT_ID,
    OAUTH2_CLIENT_SECRET,
    NEXTAUTH_PROVIDER_ID,
    NEXTAUTH_PROVIDER_NAME,
    NEXTAUTH_AUTHORIZATION_SCOPE_OVERRIDE,
    OIDC_CONF_FULL_WELL_KNOWN_URL,
    NEXTAUTH_REQUIRED_GROUP,
    NEXTAUTH_GROUPS_CLAIM,
} = getEnvironmentVariables([
    'OAUTH2_ACTIVE',
    'OAUTH2_CLIENT_ID',
    'OAUTH2_CLIENT_SECRET',
    'NEXTAUTH_PROVIDER_ID',
    'NEXTAUTH_PROVIDER_NAME',
    'NEXTAUTH_AUTHORIZATION_SCOPE_OVERRIDE',
    'OIDC_CONF_FULL_WELL_KNOWN_URL',
    'NEXTAUTH_REQUIRED_GROUP',
    'NEXTAUTH_GROUPS_CLAIM',
]);

const isOauth2Enabled = OAUTH2_ACTIVE?.toLowerCase() != 'false';

// UX-only gate: keep out users who lack the required group so they see a clean "access denied"
// instead of an app that 403s on every call. The backend is the real boundary. Left empty by
// default (any authenticated user); a deployment sets NEXTAUTH_REQUIRED_GROUP to the operators
// group and requests the groups claim via NEXTAUTH_AUTHORIZATION_SCOPE_OVERRIDE. The claim name is
// provider-specific (e.g. "groups" or "roles"), so it too is configurable.
const requiredGroup = NEXTAUTH_REQUIRED_GROUP || '';
const groupsClaim = NEXTAUTH_GROUPS_CLAIM || 'groups';

const hasRequiredGroup = (profile: unknown): boolean => {
    if (!requiredGroup) {
        return true;
    }
    const entitlements = (profile as Record<string, unknown> | undefined)?.[
        groupsClaim
    ];
    const groups = Array.isArray(entitlements)
        ? entitlements.map(String)
        : typeof entitlements === 'string'
          ? [entitlements]
          : [];
    return groups.includes(requiredGroup);
};

const token_endpoint_auth_method = OAUTH2_CLIENT_SECRET
    ? 'client_secret_basic'
    : 'none';

// Every request sharing a refresh waits for it, so one deadline covers discovery and token request.
const REFRESH_TIMEOUT_MS = 10_000;

const getWellKnownData = async (signal: AbortSignal) => {
    const wellKnownUrl = new URL(OIDC_CONF_FULL_WELL_KNOWN_URL);
    const wellKnown = await fetch(wellKnownUrl, { signal });
    // Read in every case, so the connection is released.
    const data = await wellKnown.json().catch(() => undefined);
    if (!wellKnown.ok || typeof data?.token_endpoint !== 'string') {
        throw new DiscoveryError(wellKnown.status);
    }

    return data;
};
// Rejects on failure; the one caller shares that rejection, so the error is logged once.
async function refreshAccessToken(token: JWT): Promise<JWT> {
    const logged = {
        user: userId(token.sub),
        access_token: accessTokenState(token),
    };

    try {
        const signal = AbortSignal.timeout(REFRESH_TIMEOUT_MS);
        const { token_endpoint } = await getWellKnownData(signal);
        const raw = {
            client_id: OAUTH2_CLIENT_ID,
            client_secret: OAUTH2_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: token.refreshToken as string,
        };

        const response = await fetch(token_endpoint, {
            method: 'POST',
            body: new URLSearchParams(raw),
            signal,
        });

        if (!response.ok) {
            throw new TokenEndpointError(
                response.status,
                await readOAuthErrorCode(response),
            );
        }

        const data: {
            access_token: string;
            expires_in: number | string;
            // Left out when the provider does not rotate refresh tokens (RFC 6749 section 6).
            refresh_token?: string;
            refresh_expires_in: number | string;
        } = await response.json();

        const times = accessTokenTimes(
            calculateExpirationDate(data.expires_in),
        );
        logAuth('refresh', {
            outcome: 'ok',
            ...logged,
            refresh_in:
                times.accessTokenRefreshAt &&
                times.accessTokenRefreshAt - getCurrentDateInSeconds(),
        });

        return {
            ...token,
            accessToken: data.access_token,
            ...times,
            refreshToken: data.refresh_token ?? token.refreshToken,
            refreshTokenExpiresAt: calculateExpirationDate(
                data.refresh_expires_in,
            ),
        };
    } catch (error) {
        logAuth(
            'refresh',
            { outcome: 'failed', ...logged, ...failureFields(error) },
            'warn',
        );
        throw error;
    }
}

const authorizationScope =
    NEXTAUTH_AUTHORIZATION_SCOPE_OVERRIDE || 'openid profile';

const wfoProvider: OAuthConfig<WfoUserProfile> = {
    id: NEXTAUTH_PROVIDER_ID,
    name: NEXTAUTH_PROVIDER_NAME,
    type: 'oauth',
    clientId: OAUTH2_CLIENT_ID,
    clientSecret: OAUTH2_CLIENT_SECRET || undefined,
    wellKnown: OIDC_CONF_FULL_WELL_KNOWN_URL,
    authorization: {
        params: {
            scope: authorizationScope,
            // A refresh token needs explicit consent; providers reject an offline_access request
            // unless prompt=consent is sent.
            ...(authorizationScope.split(' ').includes('offline_access')
                ? { prompt: 'consent' }
                : {}),
        },
    },
    idToken: true,
    checks: ['pkce', 'state'],
    userinfo: {
        request: async (context) => {
            const { client, tokens } = context;

            if (!context.provider.wellKnown || !tokens.access_token) {
                return {};
            }

            return await client.userinfo(tokens.access_token);
        },
    },
    profile(profile) {
        return {
            id: profile.sub,
            name: profile.name ?? profile.preferred_username,
            email: profile.email,
        };
    },
    client: {
        token_endpoint_auth_method,
        response_types: ['code'],
    },
};

export const authOptions: AuthOptions = {
    providers: isOauth2Enabled ? [wfoProvider] : [],
    callbacks: {
        async signIn({ profile, account }) {
            const allowed = hasRequiredGroup(profile);
            logAuth(
                'signin',
                {
                    outcome: allowed ? 'ok' : 'denied',
                    user: userId(profile?.sub),
                    refresh_token: account?.refresh_token
                        ? 'present'
                        : 'absent',
                    expires_in:
                        account?.expires_at &&
                        account.expires_at - getCurrentDateInSeconds(),
                },
                allowed ? 'info' : 'warn',
            );
            return allowed;
        },
        async jwt({ token, account, profile }) {
            // First time after signing in
            // The "account" is only available right after signing in -- adding useful data to the token
            if (account) {
                return {
                    ...token,
                    accessToken: account.access_token,
                    refreshToken: account.refresh_token,
                    ...accessTokenTimes(account.expires_at),
                    refreshTokenExpiresAt: calculateExpirationDate(
                        account.refresh_expires_in as number,
                    ),
                    profile,
                };
            }

            if (!needsRefresh(token)) {
                return token;
            }

            const refreshToken = token.refreshToken as string | undefined;
            if (!refreshToken) {
                return token;
            }

            try {
                const shared = await shareRefresh(refreshToken, () =>
                    refreshAccessToken(token),
                );
                // Each caller gets its own copy of the shared token.
                return { ...shared };
            } catch {
                // A rejection would make NextAuth clear the session cookie.
                return retryLater(token);
            }
        },
        async session({
            session,
            token,
        }: {
            session: WfoSession;
            token: JWT;
        }): Promise<WfoSession> {
            // Assign data to the session to be available in the client through the useSession hook
            return {
                ...session,
                profile: token.profile as WfoUserProfile | undefined,
                accessToken: token.accessToken ? String(token.accessToken) : '',
                accessTokenExpiresAt: token.accessTokenExpiresAt as number,
                refreshTokenExpiresAt: token.refreshTokenExpiresAt as number,
            };
        },
    },
    events: {
        signOut({ token }) {
            logAuth('signout', { user: userId(token?.sub) });
        },
    },
};
export default NextAuth(authOptions);
