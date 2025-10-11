import express from 'express';
import mcpService from '../services/mcpService.js';

const router = express.Router();

// List available MCP tools
router.get('/tools', async (req, res) => {
    try {
        const userId = req.session.id;

        // Check if MCP connection exists
        let tools = mcpService.getAvailableTools(userId);

        // Only auto-reconnect if:
        // 1. No tools available
        // 2. User is authenticated
        // 3. Has tokens
        // 4. Not in the middle of a disconnect (check if session still has auth flag)
        const shouldReconnect = tools.length === 0 &&
            req.session.isAuthenticated === true &&
            req.session.netsuiteTokens &&
            req.session.netsuiteTokens.access_token;

        if (shouldReconnect) {
            console.log('MCP connection lost, attempting to reconnect...');
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

                await mcpService.initializeMCPConnection(userId, {
                    accountId: req.session.netsuiteTokens.accountId,
                    accessToken: req.session.netsuiteTokens.access_token,
                    refreshToken: req.session.netsuiteTokens.refresh_token,
                    expiresAt: req.session.netsuiteTokens.expiresAt
                }, refreshTokenCallback);
                tools = mcpService.getAvailableTools(userId);
                console.log(`✅ MCP reconnected with ${tools.length} tools`);
            } catch (error) {
                console.error('Failed to reconnect MCP:', error.message);
            }
        }

        res.json({ tools });
    } catch (error) {
        console.error('List tools error:', error);
        res.status(500).json({ error: 'Failed to list tools' });
    }
});

// Execute MCP tool
router.post('/execute', async (req, res) => {
    try {
        const userId = req.session.id;
        const { tool, parameters } = req.body;

        if (!req.session.isAuthenticated) {
            return res.status(401).json({ error: 'Not authenticated with NetSuite' });
        }

        const result = await mcpService.executeTool(userId, tool, parameters);

        res.json({ success: true, result });
    } catch (error) {
        console.error('Tool execution error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;

