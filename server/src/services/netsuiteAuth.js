import crypto from 'crypto';
import axios from 'axios';

class NetSuiteAuthService {
    constructor() {
        // Note: PKCE challenges are now stored in express session, not in-memory
    }

    // Generate PKCE challenge
    generatePKCE() {
        const verifier = this.base64URLEncode(crypto.randomBytes(32));
        const challenge = this.base64URLEncode(
            crypto.createHash('sha256').update(verifier).digest()
        );

        return {
            code_verifier: verifier,
            code_challenge: challenge,
            code_challenge_method: 'S256'
        };
    }

    base64URLEncode(buffer) {
        return buffer.toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    // Generate OAuth 2.0 authorization URL
    getAuthorizationUrl(sessionId, config, expressSession) {
        const pkce = this.generatePKCE();

        // Store PKCE verifier in express session (persists across server restarts)
        expressSession.pkce = {
            verifier: pkce.code_verifier,
            config,
            timestamp: new Date().toISOString()
        };

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri || 'http://localhost:3001/api/auth/callback',
            scope: config.scope || 'mcp',
            state: sessionId,
            code_challenge: pkce.code_challenge,
            code_challenge_method: pkce.code_challenge_method
        });

        // NetSuite OAuth 2.0 authorization endpoint
        const authUrl = `https://${config.accountId}.app.netsuite.com/app/login/oauth2/authorize.nl?${params}`;

        console.log('Generated auth URL with PKCE challenge stored in session');
        return authUrl;
    }

    // Exchange authorization code for tokens
    async exchangeCodeForTokens(code, expressSession) {
        const pkceData = expressSession.pkce;

        if (!pkceData) {
            console.error('PKCE challenge not found in session');
            console.error('Session data:', JSON.stringify(expressSession, null, 2));
            throw new Error('Invalid session or PKCE challenge not found. Please try connecting again.');
        }

        const { verifier, config } = pkceData;
        console.log('Found PKCE challenge in session, proceeding with token exchange');

        try {
            // NetSuite token endpoint - use suitetalk.api domain for OAuth token exchange
            const tokenUrl = `https://${config.accountId}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`;

            // For Public Client with PKCE: include client_id and PKCE params in body
            // Per Oracle docs: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_158081952044.html
            const params = {
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: config.redirectUri || 'http://localhost:3001/api/auth/callback',
                client_id: config.clientId,
                code_verifier: verifier
            };

            // Only add client_secret if it exists (for confidential clients)
            if (config.clientSecret) {
                params.client_secret = config.clientSecret;
            }

            console.log('Token exchange URL:', tokenUrl);
            console.log('Token exchange params:', {
                grant_type: params.grant_type,
                redirect_uri: params.redirect_uri,
                client_id: params.client_id,
                code: '[REDACTED]',
                code_verifier: '[REDACTED]'
            });

            // For Public Client: No Authorization header, all params in body
            const response = await axios.post(tokenUrl, new URLSearchParams(params), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            // Clean up PKCE data from session
            delete expressSession.pkce;
            console.log('PKCE challenge cleaned up from session');

            return {
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                expires_in: response.data.expires_in,
                token_type: response.data.token_type,
                accountId: config.accountId
            };
        } catch (error) {
            console.error('Token exchange error details:');
            console.error('Status:', error.response?.status);
            console.error('Headers:', error.response?.headers);
            console.error('Data:', error.response?.data || error.message);
            throw new Error(`Failed to exchange authorization code for tokens: ${error.response?.status || error.message}`);
        }
    }

    // Refresh access token
    async refreshAccessToken(refreshToken, config) {
        try {
            // NetSuite token endpoint - use suitetalk.api domain for OAuth token exchange
            const tokenUrl = `https://${config.accountId}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`;

            // For Public Client: include client_id in body
            const params = {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: config.clientId
            };

            // Only add client_secret if it exists (for confidential clients)
            if (config.clientSecret) {
                params.client_secret = config.clientSecret;
            }

            console.log('Refreshing token for account:', config.accountId);

            // For Public Client: No Authorization header, all params in body
            const response = await axios.post(tokenUrl, new URLSearchParams(params), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            return {
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                expires_in: response.data.expires_in,
                token_type: response.data.token_type
            };
        } catch (error) {
            console.error('Token refresh error:', error.response?.data || error.message);
            throw new Error('Failed to refresh access token');
        }
    }

    // No longer needed - sessions are managed by express-session with file store
}

export default new NetSuiteAuthService();

