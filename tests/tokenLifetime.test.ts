import { JWT } from 'next-auth/jwt';

import {
    accessTokenState,
    accessTokenTimes,
    calculateExpirationDate,
    calculateRefreshDate,
    needsRefresh,
    retryLater,
} from '@/auth/tokenLifetime';

const NOW = 1_800_000_000;

describe('calculateExpirationDate', () => {
    it.each([
        { expiresIn: 3600, expected: NOW + 3600 },
        { expiresIn: '3600', expected: NOW + 3600 },
        { expiresIn: 0, expected: undefined },
        { expiresIn: 'soon', expected: undefined },
        { expiresIn: undefined, expected: undefined },
    ])('turns $expiresIn into $expected', ({ expiresIn, expected }) => {
        expect(calculateExpirationDate(expiresIn, NOW)).toBe(expected);
    });
});

describe('calculateRefreshDate', () => {
    it.each([
        { lifetime: 3600, margin: 300 },
        { lifetime: 3000, margin: 300 },
        { lifetime: 2999, margin: 299 },
        { lifetime: 300, margin: 30 },
        { lifetime: 9, margin: 0 },
        { lifetime: -10, margin: 0 },
    ])(
        'refreshes $margin s before a token with $lifetime s left expires',
        ({ lifetime, margin }) => {
            expect(calculateRefreshDate(NOW + lifetime, NOW)).toBe(
                NOW + lifetime - margin,
            );
        },
    );

    it('has no refresh date without an expiry', () => {
        expect(calculateRefreshDate(undefined, NOW)).toBeUndefined();
    });
});

describe('accessTokenTimes', () => {
    it.each([
        {
            expiresAt: NOW + 3600,
            expected: {
                accessTokenExpiresAt: NOW + 3600,
                accessTokenRefreshAt: NOW + 3300,
            },
        },
        {
            expiresAt: undefined,
            expected: {
                accessTokenExpiresAt: undefined,
                accessTokenRefreshAt: undefined,
            },
        },
    ])('pairs the expiry $expiresAt with its refresh date', (row) => {
        expect(accessTokenTimes(row.expiresAt, NOW)).toEqual(row.expected);
    });
});

describe('needsRefresh', () => {
    it.each([
        { expires: 600, refreshAt: 60, needs: false },
        { expires: 600, refreshAt: 0, needs: true },
        { expires: 600, refreshAt: -60, needs: true },
        { expires: 600, refreshAt: undefined, needs: false },
        { expires: -10, refreshAt: undefined, needs: true },
        { expires: undefined, refreshAt: undefined, needs: true },
    ])(
        'a token expiring in $expires s with its refresh date in $refreshAt s: $needs',
        ({ expires, refreshAt, needs }) => {
            const token: JWT = {
                accessTokenExpiresAt:
                    expires === undefined ? undefined : NOW + expires,
                accessTokenRefreshAt:
                    refreshAt === undefined ? undefined : NOW + refreshAt,
            };

            expect(needsRefresh(token, NOW)).toBe(needs);
        },
    );
});

describe('accessTokenState', () => {
    it.each([
        { expires: 600, state: 'valid' },
        { expires: 0, state: 'expired' },
        { expires: -10, state: 'expired' },
        { expires: undefined, state: 'unknown' },
    ])('a token expiring in $expires s is $state', ({ expires, state }) => {
        const token: JWT = {
            accessTokenExpiresAt:
                expires === undefined ? undefined : NOW + expires,
        };

        expect(accessTokenState(token, NOW)).toBe(state);
    });
});

describe('retryLater', () => {
    it.each([
        { expires: 600, retryAt: 30 },
        { expires: 10, retryAt: 10 },
        { expires: -10, retryAt: -10 },
    ])(
        'retries a token expiring in $expires s at $retryAt s',
        ({ expires, retryAt }) => {
            const token: JWT = { accessTokenExpiresAt: NOW + expires };

            expect(retryLater(token, NOW)).toEqual({
                accessTokenExpiresAt: NOW + expires,
                accessTokenRefreshAt: NOW + retryAt,
            });
        },
    );

    it('leaves a token without an expiry alone', () => {
        const token: JWT = { accessToken: 'access-0' };

        expect(retryLater(token, NOW)).toBe(token);
    });
});
