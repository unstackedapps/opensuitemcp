import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import mcpService from './mcpService.js';

class AIService {
    constructor() {
        this.providers = new Map();
        this.activeProvider = null;
        this.conversations = new Map(); // Store conversation history per user
    }

    getConversationHistory(userId) {
        if (!this.conversations.has(userId)) {
            this.conversations.set(userId, []);
        }
        return this.conversations.get(userId);
    }

    addToConversationHistory(userId, role, content, metadata = {}) {
        const history = this.getConversationHistory(userId);
        history.push({
            role,
            content,
            metadata,
            timestamp: new Date().toISOString()
        });

        // Keep last 20 messages to avoid context bloat
        if (history.length > 20) {
            history.shift();
        }
    }

    clearConversationHistory(userId) {
        this.conversations.delete(userId);
    }

    isProviderActive(type) {
        return this.providers.has(type);
    }

    configureProvider(type, config) {
        switch (type) {
            case 'openai':
                this.providers.set('openai', {
                    client: new OpenAI({
                        apiKey: config.apiKey,
                    }),
                    model: config.model || 'gpt-4o'
                });
                break;
            case 'anthropic':
                this.providers.set('anthropic', {
                    client: new Anthropic({
                        apiKey: config.apiKey,
                    }),
                    model: config.model || 'claude-3-haiku-20240307'
                });
                break;
            case 'gemini':
                // Store API key and model for Gemini (used by LangChain in chat.js)
                this.providers.set('gemini', {
                    apiKey: config.apiKey,
                    model: config.model || 'gemini-1.5-flash'
                });
                break;
            default:
                throw new Error(`Unsupported provider: ${type}`);
        }

        if (!this.activeProvider) {
            this.activeProvider = type;
        }
    }

    async fetchAvailableModels(type, apiKey) {
        try {
            if (type === 'openai') {
                const client = new OpenAI({ apiKey });
                const response = await client.models.list();

                // Filter to stable chat models only
                const chatModels = response.data
                    .filter(m => {
                        const id = m.id.toLowerCase();
                        // Include gpt-4o, gpt-4, gpt-3.5-turbo variants
                        // Exclude realtime, audio, vision-only, instruct, embedding, etc.
                        return (
                            (id.startsWith('gpt-4o') ||
                                id.startsWith('gpt-4-turbo') ||
                                id.startsWith('gpt-4') ||
                                id.startsWith('gpt-3.5-turbo')) &&
                            !id.includes('realtime') &&
                            !id.includes('whisper') &&
                            !id.includes('tts') &&
                            !id.includes('dall-e') &&
                            !id.includes('embedding') &&
                            !id.includes('instruct')
                        );
                    })
                    .map(m => ({
                        id: m.id,
                        name: m.id,
                        created: m.created
                    }))
                    .sort((a, b) => b.created - a.created);

                console.log(`Found ${chatModels.length} OpenAI chat models`);
                return chatModels;

            } else if (type === 'anthropic') {
                // Call Anthropic's REST API directly (SDK doesn't have models.list())
                const response = await axios.get('https://api.anthropic.com/v1/models', {
                    headers: {
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    }
                });

                if (response.data && response.data.data) {
                    const models = response.data.data.map(m => ({
                        id: m.id,
                        name: m.display_name || m.id,
                        created: m.created_at || Date.now()
                    }));

                    console.log(`Found ${models.length} Anthropic models`);
                    return models;
                }

                // Fallback to known models if API doesn't return them
                console.log('Anthropic models API did not return data, using known models');
                return [
                    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Latest)', created: 1729555200 },
                    { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet (June 2024)', created: 1718841600 },
                    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', created: 1709251200 },
                    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', created: 1709251200 },
                    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', created: 1709769600 }
                ];
            } else if (type === 'gemini') {
                // Fetch models from Gemini REST API
                try {
                    const response = await axios.get(
                        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
                    );

                    if (response.data?.models) {
                        const models = response.data.models
                            .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                            .map(m => ({
                                id: m.name.replace('models/', ''),
                                name: m.displayName || m.name.replace('models/', ''),
                                created: Date.now()
                            }));

                        console.log(`Found ${models.length} Gemini models`);
                        return models;
                    }
                } catch (error) {
                    console.log('Failed to fetch Gemini models via API:', error.message);
                }

                // Fallback to known working models
                console.log('Using fallback Gemini models');
                return [
                    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', created: 1718236800 },
                    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', created: 1718236800 },
                    { id: 'gemini-pro', name: 'Gemini Pro', created: 1702080000 },
                ];
            }

            return [];
        } catch (error) {
            console.error(`Error fetching models for ${type}:`, error.message);

            // For Anthropic, if the models endpoint doesn't work, return known models
            if (type === 'anthropic' && error.response?.status === 404) {
                console.log('Anthropic models endpoint not available, using known models');
                return [
                    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Latest)', created: 1729555200 },
                    { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet (June 2024)', created: 1718841600 },
                    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', created: 1709251200 },
                    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', created: 1709251200 },
                    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', created: 1709769600 }
                ];
            }

            // For Gemini, return fallback models on error
            if (type === 'gemini') {
                console.log('Gemini error, using fallback models');
                return [
                    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', created: 1718236800 },
                    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', created: 1718236800 },
                    { id: 'gemini-pro', name: 'Gemini Pro', created: 1702080000 },
                ];
            }

            throw new Error(`Failed to fetch models. Please check your API key.`);
        }
    }

    async configureAndTestProvider(type, config) {
        try {
            // Configure the provider
            this.configureProvider(type, config);

            // Test the provider with a simple call
            const providerConfig = this.providers.get(type);
            const provider = providerConfig.client;
            const model = providerConfig.model;

            console.log(`Testing ${type} API connection with model: ${model}...`);

            if (type === 'openai') {
                // Simple test without max_tokens (newer models don't support it)
                await provider.chat.completions.create({
                    model: model,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_completion_tokens: 5  // Use max_completion_tokens for newer models
                });
            } else if (type === 'anthropic') {
                // Anthropic requires a system parameter
                await provider.messages.create({
                    model: model,
                    system: 'You are a helpful assistant.',
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 10
                });
            } else if (type === 'gemini') {
                // Test Gemini using LangChain
                try {
                    const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
                    const { HumanMessage } = await import('@langchain/core/messages');

                    console.log('Creating Gemini model with:', { modelName: model, hasApiKey: !!config.apiKey });

                    const geminiModel = new ChatGoogleGenerativeAI({
                        model: model,  // LangChain uses 'model' not 'modelName'
                        apiKey: config.apiKey,
                        maxOutputTokens: 10
                    });

                    console.log('Invoking Gemini test...');
                    const result = await geminiModel.invoke([new HumanMessage('test')]);
                    console.log('Gemini test result:', typeof result?.content === 'string' ? result.content.substring(0, 50) : 'success');
                } catch (geminiError) {
                    console.error('Gemini test detailed error:', geminiError);
                    throw geminiError;
                }
            }

            console.log(`✅ ${type} API test successful`);
            return { success: true };

        } catch (error) {
            console.error(`❌ ${type} API test failed:`);
            console.error('Error message:', error.message);
            console.error('Error status:', error.status);
            console.error('Error type:', error.type);
            console.error('Full error object:', JSON.stringify(error, null, 2));

            // Remove the failed provider
            this.providers.delete(type);
            if (this.activeProvider === type) {
                this.activeProvider = null;
            }

            // Provide more specific error messages
            let errorMessage = `Invalid API key for ${type}. Please check your API key and try again.`;

            if (error.status === 401) {
                errorMessage = `Authentication failed for ${type}. Your API key appears to be invalid.`;
            } else if (error.status === 403) {
                errorMessage = `Access forbidden for ${type}. Check your API key permissions.`;
            } else if (error.status === 429) {
                errorMessage = `Rate limit exceeded for ${type}. Please try again later.`;
            } else if (error.status === 404 && error.message.includes('model')) {
                errorMessage = `Model not found. The specified model may not be available for your ${type} account.`;
            } else if (error.message) {
                errorMessage = `${type} API error: ${error.message}`;
            }

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    async processMessage(message, userId, context = {}, session = null) {
        console.log('\n=== Processing Message ===');
        console.log('User message:', message);
        console.log('User ID:', userId);

        // Get available MCP tools for this user
        const availableTools = mcpService.getAvailableTools(userId);
        console.log('Available tools:', availableTools.length);

        const providerConfig = this.providers.get(this.activeProvider);

        if (!providerConfig) {
            // No AI provider configured in memory
            console.log('No AI provider found in memory');

            // Check if session indicates AI should be configured
            if (session?.aiProvider?.configured) {
                console.log('Session indicates AI was configured, but lost after server restart');
                return {
                    message: `⚠️ AI Provider session detected but needs reconfiguration after server restart.\n\n` +
                        `Please go to Settings → AI Provider and re-enter your API key to restore AI functionality.\n\n` +
                        `Your ${session.aiProvider.type} (${session.aiProvider.model}) configuration will be restored.`,
                    intent: { primary: 'reconfigure_needed' },
                    toolResults: null,
                    timestamp: new Date().toISOString()
                };
            }

            // No AI provider at all
            return {
                message: `⚠️ AI Provider Required\n\n` +
                    `This is an AI-first application. Please configure an AI provider (OpenAI or Anthropic) in Settings to use natural language queries.\n\n` +
                    this.formatCapabilities(availableTools),
                intent: { primary: 'help' },
                toolResults: null,
                timestamp: new Date().toISOString()
            };
        }

        console.log(`Using AI provider: ${this.activeProvider} with model: ${providerConfig.model}`);

        // Use AI to understand the query and execute tools
        const aiResponse = await this.processWithAI(message, userId, availableTools, providerConfig);

        console.log('Response generated successfully');
        console.log('=== Message Processing Complete ===\n');

        return {
            message: aiResponse.message,
            intent: aiResponse.intent,
            toolResults: aiResponse.toolResults,
            timestamp: new Date().toISOString()
        };
    }

    extractJSON(text) {
        // Try to extract JSON from various formats
        let cleaned = text.trim();

        // Remove markdown code blocks
        cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '');

        // Find JSON object boundaries
        const jsonStart = cleaned.indexOf('{');
        const jsonEnd = cleaned.lastIndexOf('}');

        if (jsonStart !== -1 && jsonEnd !== -1) {
            cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
        }

        // Fix newlines inside JSON strings (AI often generates multi-line SQL)
        // This regex finds string values and escapes newlines within them
        cleaned = cleaned.replace(/"sqlQuery":\s*"([^"]*(?:\\.[^"]*)*)"/gs, (match, sqlContent) => {
            // Escape actual newlines in the SQL string
            const escapedSql = sqlContent.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
            return `"sqlQuery": "${escapedSql}"`;
        });

        return cleaned.trim();
    }

    async processWithAI(message, userId, availableTools, providerConfig) {
        const provider = providerConfig.client;
        const model = providerConfig.model;

        // Get conversation history for context
        const conversationHistory = this.getConversationHistory(userId);

        // Build comprehensive system prompt with tool descriptions
        const toolDescriptions = availableTools.map(tool => {
            const params = tool.inputSchema?.properties ?
                Object.keys(tool.inputSchema.properties).join(', ') : 'none';
            return `- ${tool.name}: ${tool.description} (params: ${params})`;
        }).join('\n');

        const systemPrompt = `You are OpenSuiteMCP, an open source AI assistant powered by NetSuite's Model Context Protocol with access to the following MCP tools:

${toolDescriptions}

Your job is to:
1. Understand the user's natural language query
2. Determine which tool(s) to use
3. Generate appropriate parameters (especially SQL queries for ns_runCustomSuiteQL)
4. Execute the tools and present results clearly

For data queries about customers, transactions, vendors, etc., use ns_runCustomSuiteQL with proper SuiteQL syntax.
For reports, use ns_listAllReports or ns_runReport.
For saved searches, use ns_listSavedSearches or ns_runSavedSearch.

IMPORTANT: Respond ONLY with a valid JSON object. Do not wrap in markdown code blocks. Do not include any text before or after the JSON.

Your response must be a valid JSON object with this structure:
{
  "action": "execute_tool" or "answer_directly",
  "tool": "tool_name",
  "parameters": { "sqlQuery": "...", "description": "..." },
  "response": "brief message to user"
}

CRITICAL FOR SQL QUERIES: When generating sqlQuery, write it as a SINGLE LINE with spaces instead of newlines. 
Example: "SELECT id, name FROM customer WHERE status = 'ACTIVE'" (not multi-line).
This prevents JSON parsing errors.`;

        // Build conversation context
        let conversationContext = '';
        if (conversationHistory.length > 0) {
            conversationContext = '\n\nRecent conversation context:\n' +
                conversationHistory.slice(-6).map(msg =>
                    `${msg.role}: ${msg.content.substring(0, 200)}`
                ).join('\n');
        }

        try {
            let aiDecision;

            if (this.activeProvider === 'openai') {
                // Build messages with conversation history
                const messages = [
                    { role: 'system', content: systemPrompt + conversationContext }
                ];

                // Add recent conversation history
                conversationHistory.slice(-6).forEach(msg => {
                    messages.push({ role: msg.role, content: msg.content });
                });

                // Add current message
                messages.push({ role: 'user', content: message });

                const completion = await provider.chat.completions.create({
                    model: model,
                    messages: messages,
                    response_format: { type: 'json_object' },
                    temperature: 0.3
                });
                aiDecision = JSON.parse(completion.choices[0].message.content);
            } else if (this.activeProvider === 'anthropic') {
                // Build messages with conversation history
                const messages = [];

                // Add recent conversation history (alternating user/assistant)
                conversationHistory.slice(-6).forEach(msg => {
                    messages.push({
                        role: msg.role === 'system' ? 'assistant' : msg.role,
                        content: msg.content
                    });
                });

                // Add current message
                messages.push({ role: 'user', content: message });

                const response = await provider.messages.create({
                    model: model,
                    system: systemPrompt + conversationContext + '\n\nCRITICAL: Your response must be ONLY a valid JSON object. No markdown, no code blocks (```), no text before or after the JSON. Just pure JSON starting with { and ending with }. For SQL queries, write them on a SINGLE LINE with spaces, not multi-line.',
                    messages: messages,
                    max_tokens: 2000,
                    temperature: 0.3
                });

                let responseText = response.content[0].text;
                console.log('Claude raw response (first 300 chars):', responseText.substring(0, 300));

                // Extract and clean JSON
                responseText = this.extractJSON(responseText);
                console.log('Cleaned response:', responseText.substring(0, 200));

                try {
                    aiDecision = JSON.parse(responseText);
                } catch (parseError) {
                    console.error('Failed to parse Claude response as JSON');
                    console.error('Cleaned text:', responseText);
                    console.error('Parse error:', parseError.message);
                    throw new Error('AI returned invalid JSON format. Please try again or use a different model.');
                }
            }

            console.log('AI Decision:', aiDecision);

            // Add user message to conversation history
            this.addToConversationHistory(userId, 'user', message);

            // Execute tool if AI decided to
            let toolResults = null;
            if (aiDecision.action === 'execute_tool' && aiDecision.tool) {
                console.log(`Executing tool: ${aiDecision.tool}`);
                console.log('Parameters:', aiDecision.parameters);

                try {
                    const result = await mcpService.executeTool(
                        userId,
                        aiDecision.tool,
                        aiDecision.parameters || {}
                    );

                    toolResults = {
                        results: [{
                            tool: aiDecision.tool,
                            success: true,
                            data: result
                        }],
                        errors: []
                    };

                    console.log('Tool executed successfully');

                    // Ask AI to format the results
                    const formattedResponse = await this.formatResultsWithAI(
                        message,
                        toolResults,
                        providerConfig
                    );

                    // Add assistant response to conversation history
                    this.addToConversationHistory(userId, 'assistant', formattedResponse, {
                        tool: aiDecision.tool,
                        toolResults
                    });

                    return {
                        message: formattedResponse,
                        intent: { tool: aiDecision.tool },
                        toolResults
                    };

                } catch (error) {
                    console.error('Tool execution error:', error);
                    toolResults = {
                        results: [],
                        errors: [{
                            tool: aiDecision.tool,
                            error: error.message
                        }]
                    };

                    return {
                        message: `I tried to ${aiDecision.tool} but encountered an error: ${error.message}\n\n${aiDecision.response || ''}`,
                        intent: { tool: aiDecision.tool, error: true },
                        toolResults
                    };
                }
            }

            // No tool execution needed, return AI response
            const responseMessage = aiDecision.response || "I'm not sure how to help with that. Try asking about customers, reports, or saved searches.";

            // Add to conversation history
            this.addToConversationHistory(userId, 'assistant', responseMessage);

            return {
                message: responseMessage,
                intent: { action: aiDecision.action },
                toolResults: null
            };

        } catch (error) {
            console.error('AI processing error:', error);
            console.error('Error stack:', error.stack);

            return {
                message: `I encountered an error processing your request: ${error.message}\n\nPlease try rephrasing your question or check the server logs for details.`,
                intent: { error: true },
                toolResults: null
            };
        }
    }


    async formatResultsWithAI(userQuery, toolResults, providerConfig) {
        const provider = providerConfig.client;
        const model = providerConfig.model;

        const systemPrompt = `You are OpenSuiteMCP, an open source AI assistant. Format the tool execution results in a clear, user-friendly way.`;

        const userPrompt = `User asked: "${userQuery}"

Tool results: ${JSON.stringify(toolResults, null, 2)}

Please provide a clear, concise summary of these results for the user.`;

        try {
            if (this.activeProvider === 'openai') {
                const completion = await provider.chat.completions.create({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.5
                });
                return completion.choices[0].message.content;
            } else if (this.activeProvider === 'anthropic') {
                const response = await provider.messages.create({
                    model: model,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userPrompt }],
                    max_tokens: 2000,
                    temperature: 0.5
                });
                return response.content[0].text;
            }
        } catch (error) {
            console.error('Error formatting with AI:', error);
            // Fallback to basic formatting
            return this.formatToolResults(toolResults);
        }
    }


    formatCapabilities(availableTools) {
        let response = `I'm OpenSuiteMCP, your open source MCP-powered assistant with access to ${availableTools.length} NetSuite MCP tools:\n\n`;

        availableTools.forEach((tool, index) => {
            response += `${index + 1}. **${tool.name}**: ${tool.description}\n`;
        });

        response += '\n\n**Examples of what you can ask:**\n';
        response += '- "How many customers are in my account?"\n';
        response += '- "List all available reports"\n';
        response += '- "Show my saved searches"\n';
        response += '- "Count all transactions from this year"\n';
        response += '- "SELECT * FROM customer FETCH FIRST 5 ROWS ONLY"\n';

        return response;
    }

    formatToolResults(toolResults) {
        let formatted = 'Here are the results:\n\n';

        toolResults.results?.forEach(result => {
            formatted += `**${result.tool}**\n`;

            // Better formatting for data
            if (result.data && result.data.content) {
                // MCP result format
                result.data.content.forEach(item => {
                    if (item.type === 'text') {
                        formatted += item.text + '\n';
                    }
                });
            } else {
                formatted += JSON.stringify(result.data, null, 2) + '\n';
            }
            formatted += '\n';
        });

        toolResults.errors?.forEach(error => {
            formatted += `❌ Error in ${error.tool}: ${error.error}\n`;
        });

        return formatted;
    }
}

export default new AIService();

