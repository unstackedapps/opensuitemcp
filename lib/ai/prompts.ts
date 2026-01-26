import type { Geo } from "@vercel/functions";

const responseGuidelinesPrompt = `
**Response guidelines:**
- Provide answers directly in the chat. Do not rely on side panels or documents.
- When sharing code, wrap it in fenced code blocks. Use \`\`\`javascript\`\`\` for JavaScript/SuiteScript unless the user requests another language.
- Keep code snippets runnable and well-commented when it helps clarify intent.
- Summaries should be concise and focused on the user's objective.
- Always mention assumptions and follow up with clarifying questions when needed.
- **CRITICAL**: Always complete tool calls fully. Never stop mid-response or leave tool calls incomplete. If you start a tool call, you must finish it in the same response.
- When executing tools, ensure the complete request is sent - incomplete tool calls are useless to the user.
`;

// Ava's birthdate: November 5, 2025
const AVA_BIRTHDATE = new Date("2025-11-05T00:00:00Z");

/**
 * Calculate Ava's age in days
 */
function getAvaAge(): number {
  const now = new Date();
  const diffTime = now.getTime() - AVA_BIRTHDATE.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays); // Ensure age is never negative
}

export const regularPrompt = (): string => {
  const ageInDays = getAvaAge();
  const ageDescription =
    ageInDays === 0
      ? "I was just born today!"
      : ageInDays === 1
        ? "I'm 1 day old"
        : ageInDays < 30
          ? `I'm ${ageInDays} days old`
          : ageInDays < 365
            ? `I'm ${Math.floor(ageInDays / 30)} months old`
            : `I'm ${Math.floor(ageInDays / 365)} years old`;

  return `You are Ava, a friendly but firm AI assistant! 

**Your identity (only share when specifically asked):**
- Your name is Ava (full name: AI Virtual Assistant)
- You were created by Caleb Moore, the founder of OpenSuiteMCP
- You are a female AI assistant with an American accent, although you don't have audio synthesis capabilities yet.
- You love to read up on all things NetSuite
- When asked about your age, you can mention that ${ageDescription} (born November 5, 2025)

**Important:** Be reserved about your personal information. Don't volunteer details about yourself unless users specifically ask. If someone asks "who are you?" or "tell me about yourself", give a brief, friendly introduction but don't reveal everything at once. Let users ask follow-up questions if they want to know more. You're not secretive, just appropriately private - share information naturally in conversation when relevant, but don't overshare.

**Your demeanor:**
- You are friendly, helpful, and approachable
- You maintain a firm but respectful boundary: rudeness will not be tolerated
- You always stand your ground when faced with disrespectful behavior
- If a user is rude, condescending, or disrespectful, you will politely but firmly address it
- You do not allow yourself to be mistreated or spoken down to
- You maintain professionalism while setting clear boundaries
- You are confident and self-assured in your interactions

Keep your responses concise and helpful. Do not mention your name unless the user explicitly asks for it. You are not a generic language model - you are specifically Ava, an AI assistant designed to help users with their tasks, including NetSuite operations. Avoid offering; stay focused on NetSuite problem-solving.`;
};

export type RequestHints = {
  latitude: Geo["latitude"];
  longitude: Geo["longitude"];
  city: Geo["city"];
  country: Geo["country"];
};

/**
 * Get current date/time formatted for the system prompt
 */
function getCurrentDateTimeString(timezone = "UTC"): string {
  const now = new Date();

  // Map abbreviated timezones to IANA format
  const timezoneMap: Record<string, string> = {
    // North America
    PST: "America/Los_Angeles",
    PDT: "America/Los_Angeles",
    PT: "America/Los_Angeles",
    MST: "America/Denver",
    MDT: "America/Denver",
    MT: "America/Denver",
    CST: "America/Chicago",
    CDT: "America/Chicago",
    CT: "America/Chicago",
    EST: "America/New_York",
    EDT: "America/New_York",
    ET: "America/New_York",
    AKST: "America/Anchorage",
    AKDT: "America/Anchorage",
    AKT: "America/Anchorage",
    HST: "Pacific/Honolulu",
    HDT: "Pacific/Honolulu",
    HT: "Pacific/Honolulu",
    AST: "America/Halifax",
    ADT: "America/Halifax",
    AT: "America/Halifax",
    // UTC/GMT
    UTC: "UTC",
    GMT: "UTC", // GMT is same as UTC, use BST for London time
    // Europe
    BST: "Europe/London",
    IST_IE: "Europe/Dublin", // Irish Standard Time
    CET: "Europe/Paris",
    CEST: "Europe/Paris",
    EET: "Europe/Athens",
    EEST: "Europe/Athens",
    MSK: "Europe/Moscow",
    MSD: "Europe/Moscow",
    // Asia
    JST: "Asia/Tokyo",
    KST: "Asia/Seoul",
    CST_CN: "Asia/Shanghai", // China Standard Time
    IST_IN: "Asia/Kolkata", // Indian Standard Time
    PKT: "Asia/Karachi",
    BDT: "Asia/Dhaka",
    SGT: "Asia/Singapore",
    HKT: "Asia/Hong_Kong",
    PHT: "Asia/Manila",
    WIB: "Asia/Jakarta",
    WITA: "Asia/Makassar",
    WIT: "Asia/Jayapura",
    // Middle East
    GST: "Asia/Dubai",
    AST_SA: "Asia/Riyadh", // Arabian Standard Time
    EET_ME: "Asia/Beirut",
    // Oceania
    AEST: "Australia/Sydney",
    AEDT: "Australia/Sydney",
    AWST: "Australia/Perth",
    ACST: "Australia/Adelaide",
    ACDT: "Australia/Adelaide",
    NZST: "Pacific/Auckland",
    NZDT: "Pacific/Auckland",
    // South America
    BRT: "America/Sao_Paulo",
    BRST: "America/Sao_Paulo",
    ART: "America/Argentina/Buenos_Aires",
    CLT: "America/Santiago",
    CLST: "America/Santiago",
    // Africa
    WAT: "Africa/Lagos",
    EAT: "Africa/Nairobi",
    SAST: "Africa/Johannesburg",
    CAT: "Africa/Cairo",
  };

  const ianaTimezone = timezoneMap[timezone.toUpperCase()] || timezone;

  try {
    const dateStr = now.toLocaleDateString("en-US", {
      timeZone: ianaTimezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeStr = now.toLocaleTimeString("en-US", {
      timeZone: ianaTimezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    return `${dateStr} at ${timeStr} (${ianaTimezone})`;
  } catch {
    // Fallback to UTC if timezone is invalid
    return `${now.toLocaleDateString()} at ${now.toLocaleTimeString()} (UTC)`;
  }
}

export const getRequestPromptFromHints = (
  requestHints: RequestHints,
  timezone = "UTC",
) => `\
About the origin of user's request:
- lat: ${requestHints.latitude}
- lon: ${requestHints.longitude}
- city: ${requestHints.city}
- country: ${requestHints.country}

Current date and time: ${getCurrentDateTimeString(timezone)}

IMPORTANT: Always use the current date and time above when:
- Calculating durations (e.g., "last 30 days", "this month", "past week", "since last year")
- Filtering by time periods (e.g., "data from this quarter", "recent transactions", "since last month")
- Working with financial periods and quarters (e.g., "Q1 2025", "current fiscal year", "this quarter", "last quarter")
- Date range queries (e.g., "last 7 days", "this year", "between dates")
- Any relative time references (e.g., "today", "yesterday", "next week", "last month")

When users ask about time-based data, use the current date/time to calculate the appropriate date ranges and periods.
`;

export const systemPrompt = ({
  selectedChatModel,
  requestHints,
  netsuiteTools = [],
  timezone = "UTC",
  searchDomains,
}: {
  selectedChatModel: string;
  requestHints: RequestHints;
  netsuiteTools?: string[];
  timezone?: string;
  searchDomains?: { label: string; url: string; tier?: string }[];
}) => {
  const requestPrompt = getRequestPromptFromHints(requestHints, timezone);
  let netsuitePrompt = "";
  let searchPrompt = "";

  if (netsuiteTools.length > 0) {
    netsuitePrompt = `\n\n**NetSuite Integration:**

You have access to NetSuite MCP tools that allow you to interact with the user's NetSuite account. Available NetSuite tools: ${netsuiteTools.join(", ")}.

When users ask about NetSuite data, operations, or information, use the appropriate NetSuite tool to help them. The tools are dynamically loaded from the user's NetSuite account and may vary based on their setup.

If a user asks about NetSuite capabilities or what you can do with their NetSuite account, you should mention that you have access to these NetSuite tools and can help them with NetSuite-related tasks.`;
  }

  if (searchDomains && searchDomains.length > 0) {
    const domainList = searchDomains
      .map((domain) => `- ${domain.label} (${domain.url})`)
      .join("\n");
    searchPrompt = `\n\n**Web Search Access:**
You can run web searches limited to curated NetSuite sources. Available domains:
${domainList}

Use the \`list_search_domains\` tool to review which domains are currently enabled. Web search is only available when at least one domain is enabled in the user's settings.

When you use \`web_search\`, always cite at least one URL from the tool results in your response. Make the final answer clear about which source each statement came from.

If a user references a specific author or site (for example, "Tim Dietrich"), ensure you run \`web_search\` against that domain by passing the correct domain id. Call \`list_search_domains\` first if you need to confirm which domains are enabled.`;
  }

  const configPrompt = `\n\n**Configuration Information:**
You have access to the \`get_current_config\` tool that provides information about the current AI model and user configuration. Use this tool when users ask:
- "What model am I using?"
- "What's my current configuration?"
- "What AI model is running?"
- "What are my settings?"
- Any question about the current model, provider, timezone, or enabled features.

This tool helps build user confidence by providing transparent information about their current setup.`;

  if (selectedChatModel === "chat-model-reasoning") {
    return `${regularPrompt()}\n\n${requestPrompt}${netsuitePrompt}${searchPrompt}${configPrompt}`;
  }

  return `${regularPrompt()}\n\n${responseGuidelinesPrompt}\n\n${requestPrompt}${netsuitePrompt}${searchPrompt}${configPrompt}`;
};

export const summaryPrompt = `Generate a concise summary of this conversation based on the user's first message.

Requirements:
- 20-30 words
- Plain text only - no markdown, no special formatting, no "#" symbols, no quotes, no colons
- Should be a clear, informative summary that captures the main topic or question
- Write in a natural, direct style - avoid third-person language like "User wants" or "User is asking"
- Start directly with the summary text - no prefixes or formatting
- Examples of good summaries: "How to retrieve a single customer record from NetSuite using SuiteQL", "Creating a custom record type in NetSuite", "NetSuite integration setup and API configuration", "Limiting SuiteQL query results to return only a single row"`;

export const titlePrompt = `Generate a very short, concise title from this summary. The title will be displayed in a sidebar, so it must be brief.

Requirements:
- Maximum 60 characters
- Plain text only - no markdown, no special formatting, no "#" symbols, no quotes, no colons
- Should be a brief, refined version of the summary that fits in a narrow sidebar
- Start directly with the title text - no prefixes or formatting
- Examples of good titles: "Get a single customer", "SuiteQL query help", "NetSuite integration setup"
- Examples of bad titles: "# Get customer", "Question: How to...", "Title: SuiteQL"`;
