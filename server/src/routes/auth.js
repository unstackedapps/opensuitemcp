import express from 'express';
import netsuiteAuth from '../services/netsuiteAuth.js';
import mcpService from '../services/mcpService.js';

const router = express.Router();

// Initiate OAuth flow
router.post('/connect', (req, res) => {
    try {
        const { accountId, clientId, scope } = req.body;
        const sessionId = req.session.id;

        if (!accountId || !clientId) {
            return res.status(400).json({
                error: 'Account ID and Client ID are required'
            });
        }

        // Using PKCE (Proof Key for Code Exchange) - no client secret needed
        const config = {
            accountId,
            clientId,
            scope: scope || 'mcp',
            redirectUri: `${process.env.API_URL || 'http://localhost:3001'}/api/auth/callback`
        };

        const authUrl = netsuiteAuth.getAuthorizationUrl(sessionId, config, req.session);

        res.json({ authUrl });
    } catch (error) {
        console.error('Auth initiation error:', error);
        res.status(500).json({ error: 'Failed to initiate OAuth flow' });
    }
});

// OAuth callback
router.get('/callback', async (req, res) => {
    try {
        const { code, state: sessionId, error } = req.query;

        console.log('OAuth callback received:', {
            hasCode: !!code,
            hasSessionId: !!sessionId,
            error: error || 'none'
        });

        if (error) {
            console.error('OAuth error from NetSuite:', error);
            // Send HTML that closes popup and notifies parent window
            return res.send(`
                <html>
                    <body>
                        <script>
                            window.opener.postMessage({ type: 'oauth_error', error: '${error}' }, '*');
                            window.close();
                        </script>
                        <p>Authorization failed. You can close this window.</p>
                    </body>
                </html>
            `);
        }

        if (!code || !sessionId) {
            console.error('Missing code or sessionId in callback');
            return res.send(`
                <html>
                    <body>
                        <script>
                            window.opener.postMessage({ type: 'oauth_error', error: 'missing_code' }, '*');
                            window.close();
                        </script>
                        <p>Authorization failed. You can close this window.</p>
                    </body>
                </html>
            `);
        }

        console.log('Exchanging authorization code for tokens...');
        console.log('Using session ID:', sessionId);

        // Exchange code for tokens (pass the express session object)
        const tokens = await netsuiteAuth.exchangeCodeForTokens(code, req.session);

        console.log('Token exchange successful, storing in session');

        // Calculate expiration time
        const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

        // Store tokens in session including clientId for refresh
        req.session.netsuiteTokens = {
            ...tokens,
            expiresAt,
            clientId: req.session.pkce?.config?.clientId // Store clientId for token refresh
        };
        req.session.isAuthenticated = true;

        // Create refresh token callback
        const refreshTokenCallback = async () => {
            console.log('Refreshing NetSuite token...');
            const newTokens = await netsuiteAuth.refreshAccessToken(
                req.session.netsuiteTokens.refresh_token,
                {
                    accountId: tokens.accountId,
                    clientId: req.session.netsuiteTokens.clientId // Need clientId for public client refresh
                }
            );

            // Update session with new tokens
            const newExpiresAt = new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString();
            req.session.netsuiteTokens = {
                ...req.session.netsuiteTokens,
                ...newTokens,
                expiresAt: newExpiresAt
            };

            return {
                ...newTokens,
                expiresAt: newExpiresAt
            };
        };

        // Initialize MCP connection with the new tokens
        console.log('Initializing MCP connection...');
        await mcpService.initializeMCPConnection(req.session.id, {
            accountId: tokens.accountId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt
        }, refreshTokenCallback);

        console.log('OAuth flow completed successfully');

        // Send HTML that closes popup and notifies parent window
        res.send(`
            <html>
                <body>
                    <script>
                        window.opener.postMessage({ type: 'oauth_success' }, '*');
                        window.close();
                    </script>
                    <p>Authorization successful! This window should close automatically.</p>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.send(`
            <html>
                <body>
                    <script>
                        window.opener.postMessage({ type: 'oauth_error', error: 'auth_failed' }, '*');
                        window.close();
                    </script>
                    <p>Authorization failed. You can close this window.</p>
                </body>
            </html>
        `);
    }
});

// Refresh token
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken, accountId, clientId } = req.body;

        if (!refreshToken || !accountId || !clientId) {
            return res.status(400).json({
                error: 'Refresh token, account ID, and client ID are required'
            });
        }

        const tokens = await netsuiteAuth.refreshAccessToken(refreshToken, {
            accountId,
            clientId
        });

        // Update session tokens
        req.session.netsuiteTokens = {
            ...req.session.netsuiteTokens,
            ...tokens
        };

        res.json({ success: true, tokens });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({ error: 'Failed to refresh token' });
    }
});

// Check authentication status
router.get('/status', async (req, res) => {
    const hasTokens = !!req.session.netsuiteTokens;
    const userId = req.session.id;

    // Check if MCP connection is actually active and healthy
    let mcpConnected = mcpService.hasActiveConnection(userId);

    // If we have tokens but MCP is not connected, try to restore it (e.g., after server restart)
    if (hasTokens && !mcpConnected && req.session.netsuiteTokens) {
        console.log('⚠️ Tokens exist but MCP not connected - attempting to restore connection...');

        try {
            // Create refresh token callback
            const netsuiteAuth = (await import('../services/netsuiteAuth.js')).default;
            const refreshTokenCallback = async () => {
                console.log('Refreshing NetSuite token...');
                const newTokens = await netsuiteAuth.refreshAccessToken(
                    req.session.netsuiteTokens.refresh_token,
                    {
                        accountId: req.session.netsuiteTokens.accountId,
                        clientId: req.session.netsuiteTokens.clientId
                    }
                );

                // Update session with new tokens
                const newExpiresAt = new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString();
                req.session.netsuiteTokens = {
                    ...req.session.netsuiteTokens,
                    ...newTokens,
                    expiresAt: newExpiresAt
                };

                return {
                    ...newTokens,
                    expiresAt: newExpiresAt
                };
            };

            // Try to reconnect MCP
            await mcpService.initializeMCPConnection(userId, {
                accountId: req.session.netsuiteTokens.accountId,
                accessToken: req.session.netsuiteTokens.access_token,
                refreshToken: req.session.netsuiteTokens.refresh_token,
                expiresAt: req.session.netsuiteTokens.expiresAt
            }, refreshTokenCallback);

            mcpConnected = true;
            console.log('✅ MCP connection restored from session');
        } catch (error) {
            console.error('Failed to restore MCP connection:', error.message);
            mcpConnected = false;
        }
    }

    // Only truly authenticated if we have tokens AND MCP is connected
    const isAuthenticated = hasTokens && mcpConnected;

    console.log('Auth status check - Session ID:', userId);
    console.log('Has tokens:', hasTokens);
    console.log('MCP connected:', mcpConnected);
    console.log('Is authenticated:', isAuthenticated);

    // If we have tokens but MCP is not connected, mark as connection error
    const connectionError = hasTokens && !mcpConnected;

    res.json({
        isAuthenticated,
        hasTokens,
        mcpConnected,
        connectionError, // Indicates tokens exist but connection failed
        accountId: req.session.netsuiteTokens?.accountId,
        checkedAt: new Date().toISOString()
    });
});

// Disconnect
router.post('/disconnect', async (req, res) => {
    try {
        const userId = req.session.id;

        // Disconnect MCP
        mcpService.disconnect(userId);

        // Clear conversation history
        const aiService = (await import('../services/aiService.js')).default;
        aiService.clearConversationHistory(userId);

        // Clear session
        req.session.netsuiteTokens = null;
        req.session.isAuthenticated = false;
        req.session.aiProvider = null;

        res.json({ success: true });
    } catch (error) {
        console.error('Disconnect error:', error);
        res.status(500).json({ error: 'Failed to disconnect' });
    }
});

export default router;

