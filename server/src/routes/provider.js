import express from 'express';
import aiService from '../services/aiService.js';

const router = express.Router();

// Configure AI provider
router.post('/configure', async (req, res) => {
    try {
        const { type, model, apiKey, useSessionKey } = req.body;

        // If useSessionKey is true, get API key from session (for model changes)
        let effectiveApiKey = apiKey;
        if (useSessionKey && req.session.aiProvider?.apiKey) {
            effectiveApiKey = req.session.aiProvider.apiKey;
            console.log(`Using stored API key from session for ${type}`);
        }

        if (!type || !effectiveApiKey) {
            return res.status(400).json({
                error: 'Provider type and API key are required'
            });
        }

        // Configure and test the AI service
        console.log(`Configuring AI provider: ${type} with model: ${model}`);
        const testResult = await aiService.configureAndTestProvider(type, { apiKey: effectiveApiKey, model });

        if (!testResult.success) {
            console.error(`❌ Provider test failed for ${type}:`, testResult.error);
            return res.status(400).json({
                error: testResult.error || 'Failed to configure AI provider. Please check your API key.'
            });
        }

        // Store provider config in session INCLUDING API key (session is file-based and gitignored)
        req.session.aiProvider = {
            type,
            model,
            apiKey: effectiveApiKey, // Store for persistence across server restarts
            configured: true,
            configuredAt: new Date().toISOString()
        };

        const action = useSessionKey ? 'updated' : 'configured and tested successfully';
        console.log(`✅ AI Provider ${action}: ${type} (${model}) for session ${req.session.id}`);

        res.json({
            success: true,
            message: `${type} provider with model ${model} ${action}`,
            provider: {
                type,
                model,
                configured: true
            }
        });
    } catch (error) {
        console.error('Provider configuration error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Check AI provider status
router.get('/status', async (req, res) => {
    const sessionAI = req.session.aiProvider || { configured: false };

    // Check if AI provider is actually active in memory (not just in session)
    let actuallyConfigured = sessionAI.configured && aiService.isProviderActive(sessionAI.type);

    // If session has config but memory doesn't (server restarted), restore from session
    if (sessionAI.configured && !actuallyConfigured && sessionAI.apiKey) {
        console.log(`Restoring AI provider from session: ${sessionAI.type} (${sessionAI.model})`);
        try {
            aiService.configureProvider(sessionAI.type, {
                apiKey: sessionAI.apiKey,
                model: sessionAI.model
            });
            actuallyConfigured = true;
            console.log('✅ AI provider restored from session');
        } catch (error) {
            console.error('Failed to restore AI provider:', error.message);
            actuallyConfigured = false;
        }
    }

    res.json({
        configured: actuallyConfigured,
        type: actuallyConfigured ? sessionAI.type : null,
        model: actuallyConfigured ? sessionAI.model : null,
        configuredAt: actuallyConfigured ? sessionAI.configuredAt : null
    });
});

// Fetch available models for a provider
router.post('/models', async (req, res) => {
    try {
        const { type, apiKey, useSessionKey } = req.body;

        // If useSessionKey is true, get API key from session
        let effectiveApiKey = apiKey;
        if (useSessionKey && req.session.aiProvider?.apiKey) {
            effectiveApiKey = req.session.aiProvider.apiKey;
            console.log(`Using stored API key from session for ${type}`);
        }

        if (!type || !effectiveApiKey) {
            return res.status(400).json({
                error: 'Provider type and API key are required'
            });
        }

        console.log(`Fetching available models for ${type}...`);
        const models = await aiService.fetchAvailableModels(type, effectiveApiKey);

        res.json({
            success: true,
            models
        });
    } catch (error) {
        console.error('Error fetching models:', error);
        res.status(500).json({
            error: error.message || 'Failed to fetch models. Please check your API key.'
        });
    }
});

export default router;

