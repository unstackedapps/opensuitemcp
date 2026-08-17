# Persona interview — build plan

Guided chat interview that creates or refines a custom persona, then converts the same chat into a normal NetSuite persona session.

## Decisions (locked)

| Decision | Choice |
| --- | --- |
| UX | Special **chat interview** in **normal history** |
| Mode | System persona `persona-builder`; **NetSuite MCP tools off** |
| Exit success | Propose tool → **editable confirm + Revise** → save custom → **stamp chat** → **kickoff assistant message** |
| Exit abandon | Stay builder until **Cancel interview** → Ava/default |
| Entry | Picker “Create my own…” **and** Personas CTA; if hide-picker → **Personas only** |
| Audience | **Registered users only** |
| Interview style | **Guided adaptive**, **7 coverage dimensions**, model reports progress |
| Progress | Lightweight **N/7** UI; state in **tool parts + `personaInterview` jsonb** |
| Playbook | **Builtin-shaped markdown**; **prompt-only** policy (no new runtime flags) |
| Customs schema | Add **`shortName`** (+ optional **`primaryRole`**) |
| Refine | Personas only → **new** builder chat; **`refiningPersonaId`** on Chat; Save overwrites |
| Titles | `Persona interview` / `Refining: {name}`; keep after Save |
| Cap | Block **Create** at 32; Refine OK |
| Defaults | Optional checkbox on confirm (unchecked; never auto-enable hide-picker) |

### Coverage dimensions (7)

1. Role / job focus  
2. NetSuite domains  
3. Typical tasks / success criteria  
4. Risk & write posture  
5. Preferred approaches (SuiteQL vs UI vs SuiteScript / saved searches, etc.)  
6. Tone & verbosity  
7. Hard constraints / never-dos  

N/A allowed when clearly irrelevant; still counts as covered.

### Out of scope (v1)

- Runtime policy flags from metadata  
- In-place flip of an active NetSuite chat into builder  
- Guest customs / ephemeral guest save  
- Auto hide-picker from Save  
- User-skippable checklist  

---

## Phase 0 — Foundations (schema + IDs)

1. **IDs / types**
   - `PERSONA_BUILDER_ID = "persona-builder"` in `lib/ai/personas/ids.ts`
   - Extend `CustomPersona` with `shortName` + optional `primaryRole`
   - Update `normalizeCustomPersonas`, `resolvePersona`, `listPersonasForClient`, `clientPersonaShortName`
2. **DB migration** `0012_persona_interview.sql`
   - `Chat.refiningPersonaId` varchar(64) nullable  
   - `Chat.personaInterview` jsonb nullable  
3. **Queries** — save/update helpers for title, persona, refining id, interview state, conversion, cancel  
4. **Auth** — builder entry + confirm Save: registered only  

**Done when:** catalog/tests understand builder id + custom shortName; migration applies.

---

## Phase 1 — Builder runtime (server)

1. Builder system prompt + interview helpers (`lib/ai/personas/interview.ts`, prompt wiring)  
2. `app/api/chat/route.ts` — builder mode: no NetSuite MCP; fixed titles; guest/cap gates  
3. Tools: `update_persona_interview`, `propose_custom_persona` (propose gated on full coverage)  
4. `POST /api/chat/[id]/persona-confirm` — persist custom, stamp chat, kickoff message, optional default  
5. `POST /api/chat/[id]/persona-cancel` — stamp Ava/default; clear interview fields  

**Done when:** API-testable create/refine/cancel without NetSuite tools in builder.

---

## Phase 2 — Entry + seed UX

1. Picker: registered “Create my own…” → `persona-builder`  
2. Personas panel: Create with interview + Refine (new chat + `refiningPersonaId`); block Create at 32  
3. Seeded assistant opener (create vs refine)  
4. Chrome: progress N/7, Cancel control, sidebar/badge labels  

---

## Phase 3 — Propose / confirm / revise UI

1. Tool output card → editable confirm dialog (name, shortName, content, set-as-default)  
2. Save / Revise / Dismiss  
3. After Save: refresh persona lock + show kickoff  

---

## Phase 4 — Polish

- Manual Personas edit path keeps shortName/primaryRole  
- Fallback shortName from name for legacy customs  
- E2E smoke: create → propose → save → tools unlock; cancel; refine; guest/cap blocked  

---

## PR slices

1. Phase 0 + catalog/shortName  
2. Phase 1 server builder + tools + confirm/cancel  
3. Phase 2–3 UI  
4. Phase 4 tests/polish  

## Status

- [x] Phase 0 — Foundations (schema + IDs + shortName)
- [x] Phase 1 — Builder runtime (prompt, tools, confirm/cancel, chat route gates)
- [x] Phase 2 — Entry + seed (`/api/chat/persona-builder/start`, picker + Personas CTAs)
- [x] Phase 3 — Propose/confirm/revise UI (tool outputs + confirm API)
- [ ] Phase 4 — Polish (Cancel control in chrome, N/7 header, E2E)

Run migration: `pnpm db:migrate` (adds `0012_persona_interview`).

