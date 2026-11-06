export function normalizeEmail(value) {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    return email;
}

export function createEmailLogin(host, request = fetch) {
    const base = new URL(host);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !['', '/'].includes(base.pathname)) {
        throw new Error('This app needs a secure Fleetbase server address.');
    }
    const post = async (path, body) => {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 20000);
        try {
            const response = await request(`${base.origin}/v1/navigator/auth/${path}`, {
                method: 'POST', credentials: 'omit', redirect: 'error', signal: abort.signal,
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (response.status === 429) throw new Error('Too many attempts. Wait before trying again.');
            if (!response.ok) throw new Error(path === 'verify' ? 'The code is invalid, expired, or unavailable. Try again.' : 'The email request could not be completed. Try again later.');
            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') throw new Error('The server did not confirm the request. Check your inbox before requesting another code.');
            throw error;
        } finally {
            clearTimeout(timer);
        }
    };
    return {
        send: (email) => post('email', { email: normalizeEmail(email) }),
        verify: async (email, code) => {
            if (!/^\d{6}$/.test(code)) throw new Error('Enter the six-digit code from your email.');
            const result = await post('verify', { email: normalizeEmail(email), code });
            const driver = result.driver;
            if (!driver || typeof driver.id !== 'string' || !driver.id.startsWith('driver_') || typeof driver.token !== 'string' || !driver.token) {
                throw new Error('The server did not return a valid driver session.');
            }
            return driver;
        },
    };
}
