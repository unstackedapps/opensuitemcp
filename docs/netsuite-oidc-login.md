# NetSuite OIDC login (app sign-in)

Use this to let people **sign in to OpenSuiteMCP** with their NetSuite user. This is **not** MCP chat connect (that uses a separate integration and `/api/netsuite/callback`).

The same steps are available in-app from **NetSuite setup steps** on `/login`,
`/setup`, Settings → NetSuite (solo), and Admin → OIDC login.

Redirect URI (replace the host with your app origin):

```text
{host}/api/auth/netsuite/callback
```

Local example: `http://localhost:3000/api/auth/netsuite/callback`

## In NetSuite

1. **Setup → Company → Enable Features**
2. Open the **SuiteCloud** tab. Check **NetSuite as OIDC Provider** and **Save**.
3. **Setup → Integration → Manage Integrations → New**
4. Fill in:
   - **Name:** `OpenSuiteMCP Login OIDC` (or similar)
   - **State:** Enabled
   - **Authorization Code Grant:** checked
   - **Public Client:** checked
   - **Redirect URI:** `{host}/api/auth/netsuite/callback`
   - **No scopes** checked
   - **No token-based authentication types** checked
5. **Save** the record. Copy and store the **Client ID** (shown after save).
6. **Setup → Integration → NetSuite as OIDC Provider Setup**
7. Find the integration you just created.
8. Set **access options** for allowed entities and roles. This is the audience that can sign in to OpenSuiteMCP with this app.
9. **Save**.
10. Take the **account ID** from the NetSuite URL (for example `1234567` or `1234567-sb1`) and the **client ID** from step 5.

## In OpenSuiteMCP

Enter that account ID and client ID in the OIDC setup form:

| Install | Where |
| --- | --- |
| **Organization** | First-run `/setup`, or later **Admin → NetSuite → OIDC login**. Optional at install via `OSMCP_NS_ACCOUNT_ID` and `OSMCP_NS_OIDC_CLIENT_ID`. Org owner NetSuite email must match `OSMCP_ROOT_EMAIL`. |
| **Solo** | `/login` → **NetSuite**, or after sign-in **Settings → NetSuite → Sign in**. Same optional env vars. |

Then continue with **Sign in with NetSuite**.

The app requests OIDC `openid` and `email` on the authorize call. Leave **scopes unchecked** on the NetSuite **integration** record (step 4). Do not reuse the MCP integration (scope **mcp**, callback `/api/netsuite/callback`).
