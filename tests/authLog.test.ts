/** @jest-environment node */
import {
    TokenEndpointError,
    failureFields,
    logAuth,
    readOAuthErrorCode,
    userId,
} from '@/auth/log';

describe('logAuth', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it.each([
        {
            fields: { outcome: 'ok', user: '3f9a1c02' },
            line: 'auth event=refresh outcome=ok user=3f9a1c02',
        },
        {
            fields: { outcome: 'ok', user: undefined },
            line: 'auth event=refresh outcome=ok',
        },
        {
            fields: { refresh_in: 3300 },
            line: 'auth event=refresh refresh_in=3300',
        },
        {
            fields: { reason: 'two words', other: 'a=b' },
            line: 'auth event=refresh reason="two words" other="a=b"',
        },
        { fields: {}, line: 'auth event=refresh' },
    ])('writes $line', ({ fields, line }) => {
        const info = jest.spyOn(console, 'info').mockImplementation();

        logAuth('refresh', fields);

        expect(info).toHaveBeenCalledWith(line);
    });

    it('writes failures as warnings', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation();
        const info = jest.spyOn(console, 'info').mockImplementation();

        logAuth('refresh', { outcome: 'failed' }, 'warn');

        expect(warn).toHaveBeenCalledWith('auth event=refresh outcome=failed');
        expect(info).not.toHaveBeenCalled();
    });
});

describe('userId', () => {
    it('is a short, stable hash that does not contain the identifier', () => {
        const id = userId('subject-1');

        expect(id).toMatch(/^[0-9a-f]{8}$/);
        expect(userId('subject-1')).toBe(id);
        expect(userId('subject-2')).not.toBe(id);
    });

    it.each([undefined, ''])('has no id for %p', (sub) => {
        expect(userId(sub)).toBeUndefined();
    });
});

describe('readOAuthErrorCode', () => {
    it.each([
        { body: '{"error":"invalid_grant"}', code: 'invalid_grant' },
        { body: '{"error":"Bad Request: token abc"}', code: undefined },
        { body: '{"error":5}', code: undefined },
        { body: '{}', code: undefined },
        { body: '<html>Bad Gateway</html>', code: undefined },
    ])('reads $code from $body', async ({ body, code }) => {
        expect(await readOAuthErrorCode(new Response(body))).toBe(code);
    });
});

describe('failureFields', () => {
    it.each([
        {
            error: new TokenEndpointError(400, 'invalid_grant'),
            fields: { status: 400, error: 'invalid_grant' },
        },
        {
            error: new TokenEndpointError(502),
            fields: { status: 502, error: undefined },
        },
        {
            error: new DOMException('timed out', 'TimeoutError'),
            fields: { reason: 'TimeoutError' },
        },
        {
            error: new TypeError('fetch failed'),
            fields: { reason: 'TypeError' },
        },
        { error: 'unexpected', fields: { reason: 'unknown' } },
    ])('describes $fields', ({ error, fields }) => {
        expect(failureFields(error)).toEqual(fields);
    });
});
