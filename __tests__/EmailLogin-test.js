import { createEmailLogin, normalizeEmail } from '../src/auth/email-login';

describe('single-instance email sign-in', () => {
    const host = 'https://api.example.test';
    test('validates and normalizes identity without sending configuration or credentials', async () => {
        const request = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
        await createEmailLogin(host, request).send(' Driver@Example.test ');
        expect(request).toHaveBeenCalledTimes(1);
        const [url, options] = request.mock.calls[0];
        expect(url).toBe(`${host}/v1/navigator/auth/email`);
        expect(JSON.parse(options.body)).toEqual({ email: 'driver@example.test' });
        expect(options.credentials).toBe('omit');
        expect(options.headers.Authorization).toBeUndefined();
        expect(options.redirect).toBe('error');
        expect(() => normalizeEmail('bad')).toThrow();
        expect(() => createEmailLogin('http://api.example.test', request)).toThrow();
        expect(() => createEmailLogin('https://secret@api.example.test', request)).toThrow();
    });
    test('refuses invalid codes before sending and accepts only a driver session', async () => {
        const request = jest.fn();
        const api = createEmailLogin(host, request);
        await expect(api.verify('driver@example.test', '123')).rejects.toThrow();
        expect(request).not.toHaveBeenCalled();
        request.mockResolvedValue({ ok: true, json: async () => ({ driver: { id: 'driver_123', token: 'private-token' } }) });
        await expect(api.verify('driver@example.test', '123456')).resolves.toEqual({ id: 'driver_123', token: 'private-token' });
        request.mockResolvedValue({ ok: true, json: async () => ({ driver: { id: 'user_123', token: 'private-token' } }) });
        await expect(api.verify('driver@example.test', '123456')).rejects.toThrow('valid driver session');
    });
    test('does not retry refused or uncertain requests', async () => {
        const request = jest.fn().mockResolvedValue({ ok: false, status: 429 });
        await expect(createEmailLogin(host, request).send('driver@example.test')).rejects.toThrow('Too many attempts');
        expect(request).toHaveBeenCalledTimes(1);
        request.mockRejectedValue(Object.assign(new Error(), { name: 'AbortError' }));
        await expect(createEmailLogin(host, request).send('driver@example.test')).rejects.toThrow('Check your inbox');
        expect(request).toHaveBeenCalledTimes(2);
    });
});
