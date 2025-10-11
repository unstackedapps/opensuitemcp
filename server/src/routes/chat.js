import express from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import mcpService from '../services/mcpService.js';

const router = express.Router();

// Get conversation history
router.get('/history', (req, res) => {
    try {
        const messages = req.session.conversationHistory || [];
        res.json({ messages });
    } catch (error) {
        console.error('Error fetching conversation history:', error);
        res.status(500).json({ error: 'Failed to fetch conversation history' });
    }
});

// Save conversation history (called by frontend after each message)
router.post('/history', (req, res) => {
    try {
        const { messages } = req.body;
        req.session.conversationHistory = messages;
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving conversation history:', error);
        res.status(500).json({ error: 'Failed to save conversation history' });
    }
});

// Clear conversation history
router.post('/clear', (req, res) => {
    try {
        req.session.conversationHistory = [];
        res.json({ success: true, message: 'Conversation cleared' });
    } catch (error) {
        console.error('Error clearing conversation:', error);
        res.status(500).json({ error: 'Failed to clear conversation' });
    }
});

// Send message to AI with streaming
router.post('/message', async (req, res) => {
    try {
        const { messages } = req.body;
        const userId = req.session.id;

        console.log('Chat request - Session ID:', userId);
        console.log('Is authenticated:', req.session.isAuthenticated);
        console.log('Messages in conversation:', messages?.length || 0);

        // Filter out messages with empty content (causes AI API errors)
        const validMessages = (messages || []).filter(msg => {
            if (!msg.content || typeof msg.content !== 'string') return false;
            return msg.content.trim().length > 0;
        });

        console.log('Valid messages after filtering:', validMessages.length);

        // Debug: Log messages to see what's being sent
        if (validMessages.length !== messages?.length) {
            console.warn('Filtered out empty messages:', {
                original: messages?.length,
                valid: validMessages.length,
                filtered: messages?.filter(m => !m.content || !m.content.trim())
            });
        }

        // Save conversation to session for persistence across reloads
        req.session.conversationHistory = validMessages;

        if (!req.session.isAuthenticated) {
            return res.status(401).json({
                error: 'Not authenticated with NetSuite',
                message: 'Please connect to NetSuite first.',
                timestamp: new Date().toISOString()
            });
        }

        // Check if AI provider is configured
        if (!req.session.aiProvider?.configured) {
            return res.status(400).json({
                error: 'AI provider not configured',
                message: '⚠️ Please configure an AI provider (OpenAI or Anthropic) in Settings to use natural language queries.',
                timestamp: new Date().toISOString()
            });
        }

        // Check if MCP connection exists, if not, reconnect
        let availableTools = mcpService.getAvailableTools(userId);
        if (availableTools.length === 0) {
            console.log('MCP connection lost, reconnecting...');

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
            availableTools = mcpService.getAvailableTools(userId);
        }

        console.log(`Using ${req.session.aiProvider.type} (${req.session.aiProvider.model})`);
        console.log(`Available MCP tools: ${availableTools.length}`);

        // Initialize LangChain model
        let model;
        if (req.session.aiProvider.type === 'openai') {
            model = new ChatOpenAI({
                modelName: req.session.aiProvider.model,
                apiKey: req.session.aiProvider.apiKey,
                temperature: 0.3,
                streaming: true,
            });
        } else if (req.session.aiProvider.type === 'anthropic') {
            model = new ChatAnthropic({
                modelName: req.session.aiProvider.model,
                anthropicApiKey: req.session.aiProvider.apiKey,
                temperature: 0.3,
                streaming: true,
            });
        } else if (req.session.aiProvider.type === 'gemini') {
            model = new ChatGoogleGenerativeAI({
                model: req.session.aiProvider.model,  // Use 'model' not 'modelName'
                apiKey: req.session.aiProvider.apiKey,
                temperature: 0.3,
                streaming: true,
            });
        } else {
            throw new Error(`Unsupported AI provider: ${req.session.aiProvider.type}`);
        }

        // Build LangChain tools from MCP tools
        const tools = availableTools.map(mcpTool => {
            const schemaProps = {};

            if (mcpTool.inputSchema?.properties) {
                Object.entries(mcpTool.inputSchema.properties).forEach(([key, prop]) => {
                    // Map property types correctly
                    if (prop.type === 'string') {
                        schemaProps[key] = z.string().describe(prop.description || key);
                    } else if (prop.type === 'number' || prop.type === 'integer') {
                        schemaProps[key] = z.number().describe(prop.description || key);
                    } else if (prop.type === 'boolean') {
                        schemaProps[key] = z.boolean().describe(prop.description || key);
                    } else {
                        schemaProps[key] = z.string().describe(prop.description || key);
                    }

                    // Make optional if not required
                    if (!mcpTool.inputSchema.required?.includes(key)) {
                        schemaProps[key] = schemaProps[key].optional();
                    }
                });
            }

            return new DynamicStructuredTool({
                name: mcpTool.name,
                description: mcpTool.description,
                schema: z.object(schemaProps),
                func: async (params) => {
                    console.log(`Executing MCP tool: ${mcpTool.name}`);
                    console.log('Parameters:', JSON.stringify(params, null, 2));

                    // Filter out undefined/null params
                    const cleanParams = {};
                    Object.entries(params).forEach(([key, value]) => {
                        if (value !== undefined && value !== null) {
                            cleanParams[key] = value;
                        }
                    });

                    const result = await mcpService.executeTool(userId, mcpTool.name, cleanParams);

                    // LangChain tools must return a string
                    return JSON.stringify(result);
                }
            });
        });

        // Create an agent that can execute tools
        const systemPrompt = `You are OpenSuiteMCP, an open source AI assistant powered by NetSuite's Model Context Protocol (MCP) with access to MCP tools for querying NetSuite data.

CRITICAL SuiteQL TABLE NAMES (case-sensitive):
- customer (NOT Customer) - Customer records. Primary key is 'id' not 'internalid'
- vendor (NOT Vendor) - Vendor records  
- item (NOT Item) - Inventory items
- employee (NOT Employee) - Employees
- account (NOT Account) - GL accounts

For TRANSACTIONS use:
- salesorder, purchaseorder, invoice, bill, journalentry

SuiteQL Rules:
- Table names are LOWERCASE
- Use 'id' as primary key (NOT internalid)
- Use ROWNUM for limits
- Single-line queries only

Format results clearly with markdown.`;

        const prompt = ChatPromptTemplate.fromMessages([
            ['system', systemPrompt],
            ['placeholder', '{chat_history}'],
            ['human', '{input}'],
            ['placeholder', '{agent_scratchpad}'],
        ]);

        const agent = await createToolCallingAgent({
            llm: model,
            tools,
            prompt,
        });

        const agentExecutor = new AgentExecutor({
            agent,
            tools,
            maxIterations: 5,
            verbose: true,
        });

        // Get just the last user message
        const lastUserMessage = validMessages[validMessages.length - 1];

        // Stream response with agent
        console.log('Starting LangChain agent stream...');

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const stream = await agentExecutor.stream({
            input: lastUserMessage.content,
            chat_history: validMessages.slice(0, -1).map(msg =>
                msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
            ),
        });

        for await (const chunk of stream) {
            // Agent returns { output: "final text" } at the end
            if (chunk.output) {
                // First, signal that thinking is done
                res.write(`data: ${JSON.stringify({ type: 'step-finish', reason: 'stop' })}\n\n`);

                // Handle different output formats
                let outputText;
                if (typeof chunk.output === 'string') {
                    // OpenAI/Anthropic: output is a string
                    outputText = chunk.output;
                } else if (Array.isArray(chunk.output) && chunk.output[0]?.text) {
                    // Gemini: output is array of {type, text} objects
                    outputText = chunk.output.map(item => item.text || '').join('');
                } else {
                    // Fallback: stringify
                    outputText = JSON.stringify(chunk.output);
                }

                // Then send the actual content (now isThinking will be false)
                res.write(`data: ${JSON.stringify({ type: 'text', content: outputText })}\n\n`);
            }
        }

        // Send done signal
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
        console.log('✅ LangChain agent stream completed');

    } catch (error) {
        console.error('Chat message error:', error);
        res.status(500).json({
            error: error.message,
            message: 'Sorry, I encountered an error processing your request.',
            timestamp: new Date().toISOString()
        });
    }
});

export default router;

