import axios from 'axios';
import { EventEmitter } from 'events';

class MCPService extends EventEmitter {
    constructor() {
        super();
        this.connections = new Map(); // Store MCP connections per user
    }

    // Initialize MCP connection for a user (using NetSuite's native MCP REST API)
    async initializeMCPConnection(userId, netsuiteConfig, refreshTokenCallback) {
        try {
            console.log('Initializing MCP connection for user:', userId);
            console.log('Account ID:', netsuiteConfig.accountId);

            const connection = {
                accountId: netsuiteConfig.accountId,
                accessToken: netsuiteConfig.accessToken,
                refreshToken: netsuiteConfig.refreshToken,
                expiresAt: netsuiteConfig.expiresAt,
                refreshTokenCallback, // Store callback for token refresh
                tools: [],
                connected: false
            };

            // Fetch available tools from NetSuite MCP API
            const tools = await this.fetchToolsList(netsuiteConfig.accountId, netsuiteConfig.accessToken);

            connection.tools = tools;
            connection.connected = true;

            this.connections.set(userId, connection);

            console.log(`MCP connection established with ${tools.length} tools available`);
            this.emit('connected', userId, connection.tools);

            return { success: true, message: 'MCP connection initialized', toolCount: tools.length };
        } catch (error) {
            console.error('Failed to initialize MCP connection:', error);
            throw error;
        }
    }

    // Check if token is expired and refresh if needed
    async ensureValidToken(userId) {
        const connection = this.connections.get(userId);
        if (!connection) {
            throw new Error('No connection found for user');
        }

        // Check if token is expired or will expire in next 5 minutes
        if (connection.expiresAt) {
            const expiresAt = new Date(connection.expiresAt).getTime();
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;

            if (expiresAt - now < fiveMinutes) {
                console.log('Token expired or expiring soon, refreshing...');

                if (connection.refreshTokenCallback) {
                    try {
                        const newTokens = await connection.refreshTokenCallback();
                        // Update connection with new tokens
                        connection.accessToken = newTokens.access_token;
                        connection.expiresAt = newTokens.expiresAt;
                        console.log('✅ Token refreshed successfully');
                    } catch (error) {
                        console.error('Failed to refresh token:', error.message);
                        throw new Error('Session expired. Please reconnect to NetSuite.');
                    }
                }
            }
        }

        return connection.accessToken;
    }

    // Fetch tools list from NetSuite MCP API
    async fetchToolsList(accountId, accessToken) {
        try {
            const url = `https://${accountId}.suitetalk.api.netsuite.com/services/mcp/v1/all`;

            const response = await axios.post(url, {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/list',
                params: {}
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('Tools list response:', response.data);

            if (response.data.result && response.data.result.tools) {
                return response.data.result.tools;
            }

            return [];
        } catch (error) {
            console.error('Error fetching tools list:', error.response?.data || error.message);

            // If 401 error, mark connection as failed (token expired)
            if (error.response?.status === 401) {
                console.error('⚠️ NetSuite authentication failed - token expired or invalid');
            }

            throw error;
        }
    }

    // Execute MCP tool via NetSuite REST API
    async executeTool(userId, toolName, parameters) {
        const connection = this.connections.get(userId);
        if (!connection || !connection.connected) {
            throw new Error('MCP connection not established');
        }

        try {
            // Ensure token is valid, refresh if needed
            const accessToken = await this.ensureValidToken(userId);

            const url = `https://${connection.accountId}.suitetalk.api.netsuite.com/services/mcp/v1/all`;

            const response = await axios.post(url, {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: parameters
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            console.log('Tool execution response:', response.data);

            if (response.data.error) {
                throw new Error(response.data.error.message || 'Tool execution failed');
            }

            return response.data.result;
        } catch (error) {
            console.error('Tool execution error:', error.response?.data || error.message);

            // If 401 error, mark connection as failed (token expired)
            if (error.response?.status === 401) {
                const connection = this.connections.get(userId);
                if (connection) {
                    connection.connected = false;
                    console.error('⚠️ NetSuite authentication failed - marking connection as disconnected');
                }
            }

            throw error;
        }
    }

    // List available tools for a user
    getAvailableTools(userId) {
        const connection = this.connections.get(userId);
        if (!connection) {
            return [];
        }
        return connection.tools;
    }

    // Check if user has an active MCP connection
    hasActiveConnection(userId) {
        const connection = this.connections.get(userId);
        return !!(connection && connection.connected === true && connection.tools && connection.tools.length > 0);
    }

    // Disconnect MCP connection
    disconnect(userId) {
        const connection = this.connections.get(userId);
        if (connection) {
            this.connections.delete(userId);
            console.log('MCP connection disconnected for user:', userId);
        }
    }
}

export default new MCPService();

