# OpenSuiteMCP NetSuite AI Assistant

> **Early Phase Project**: This is an early-phase project. Unstacked Apps, LLC intends to host an official version at the opensuitemcp domain when resources and time permit.

## License & Usage

This project is licensed under the **Sustainable Use License**. You may:

✅ **Use privately or internally** within your organization  
✅ **Self-host** on your own infrastructure (on-premises or private cloud)  
✅ **Modify and extend** for your internal needs  
✅ **Distribute freely** for non-commercial purposes  

❌ **Commercial use and profit are prohibited**. You may NOT:
- Sell, sublicense, or profit from this software in any way
- White-label this software and offer it to customers for money
- Host this software and charge people money to access it
- Redistribute as part of a commercial product or service
- Charge fees, subscriptions, or any form of payment for access

**ALL COMMERCIAL RIGHTS ARE RESERVED BY UNSTACKED APPS, LLC.** Only Unstacked Apps, LLC may commercialize, sell, or profit from this software.

For questions about licensing or commercial use, contact:
- Email: support@unstackedapps.com
- Website: https://www.unstackedapps.com/

See [LICENSE](LICENSE) for full terms.

## Attribution

This project is based on the [Next.js AI Chatbot template](https://vercel.com/templates/next.js/nextjs-ai-chatbot) by Vercel. We extend this template with NetSuite-specific integrations and features.

**Important**: While this project uses many open source technologies (Next.js, React, Vercel AI SDK, etc.) that can be used freely according to their licenses, the **specific combination and implementation** in this codebase is protected. You may build a similar app from scratch using the same technologies, but you may not copy this specific codebase, rebrand it, and commercialize it.

See [ATTRIBUTION.md](ATTRIBUTION.md) for complete attribution information.

## Environment Setup

Automate all setup steps by running:

```bash
pnpm setup:backend
```

This will generate secrets, create `.env.local`, and optionally start Docker containers (PostgreSQL, Redis, and SearXNG).

## Running locally

```bash
pnpm install
pnpm db:migrate # Setup database or apply latest database changes
pnpm dev
```

Your app template should now be running on [localhost:3000](http://localhost:3000).

## Configure Your API Key

Open the **Settings** modal (accessible from the sidebar) and enter your AI provider API key (Google or Anthropic). API keys are encrypted and stored securely in your database. The app supports both Google (Gemini) and Anthropic (Claude) models. Both authenticated users and guests can manage their API keys through the Settings modal.
