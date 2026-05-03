# Her Planner

An AI-powered daily life planner for women, featuring Luna — a warm AI assistant who knows your cycle phase, energy, mood, and daily priorities.

## Architecture

### Monorepo Structure
- `artifacts/her-planner/` — React + Vite frontend (served at `/`)
- `artifacts/her-planner-mobile/` — Expo React Native mobile app (served at `/mobile/`, iOS/Android via Expo Go QR)
- `artifacts/api-server/` — Express API server (served at `/api`)
- `lib/api-client-react/` — Generated React Query hooks from OpenAPI spec
- `lib/api-zod/` — Generated Zod validation schemas from OpenAPI spec
- `lib/api-spec/` — OpenAPI spec (`openapi.yaml`) + codegen config
- `lib/db/` — Drizzle ORM schema + database connection

### Tech Stack
- **Web Frontend**: React 18, Vite, TailwindCSS v4, Wouter routing, TanStack React Query
- **Mobile**: Expo SDK 54 (React Native), expo-router tabs, NativeTabs (iOS 26 liquid glass), @expo-google-fonts/plus-jakarta-sans
- **UI Fonts**: Fraunces (serif headings, web) + Plus Jakarta Sans (body, both platforms)
- **Color Theme**: Warm rose / dusty mauve (`#c0788a`)
- **API**: Express.js, Drizzle ORM, PostgreSQL
- **AI**: OpenAI GPT-4o (via Replit AI Integration), streaming SSE responses

## Shared Constants (mobile)
- `constants/cycle.ts` — Canonical PHASE_COLORS, PHASE_EMOJI, PHASE_KEYS, SYMPTOM_KEYS (imported by all screens)
- `constants/storage.ts` — Canonical AsyncStorage key strings: language, lunaConversation, todaySymptoms(date)
- `constants/translations.ts` — Full i18n for EN/ES/PT (~100 keys)
- `constants/colors.ts` — Design tokens, useColors() hook

## Pages (mobile tabs)
- **Today** (index.tsx) — Check-in wizard, ring charts, task list, Luna streaming chat modal
- **Week** (week.tsx) — Weekly dual-bar chart (energy+sleep), mood row, wellness summary
- **Month** (month.tsx) — Calendar grid with phase overlays, day-detail modal
- **Cycle** (cycle.tsx) — Phase card, today's symptoms picker, cycle entry log
- **Me** (profile.tsx) — Name, language, work schedule, kids, cycle length, period length, health conditions

## Database Tables
- `profiles` — User profile (name, hasKids, workSchedule, cycleLength, periodLength, healthConditions)
- `tasks` — Tasks with category, priority, view (today/week/month), completed, aiSuggested
  - Indexes: tasks_view_idx, tasks_completed_idx, tasks_category_idx
- `cycle_entries` — Period start/end, ovulation, symptoms, notes
  - Indexes: cycle_entries_date_idx, cycle_entries_entry_type_idx
- `daily_contexts` — Daily sleep, energy level (1–5 scale), mood (unique per date)
- `conversations` — AI chat conversation sessions
- `messages` — Chat messages

## API Routes
All routes prefixed with `/api`:
- `GET/POST/PUT /profile`
- `GET/POST /tasks`, `GET/PUT/DELETE /tasks/:id`, `GET /tasks/summary`
- `GET /cycle/entries`, `POST /cycle/entries`, `GET /cycle/current-phase`
- `GET/POST /daily-context/entries`, `GET /daily-context/today`, `GET /daily-context/streak`
- `GET/POST /openai/conversations`, `GET/DELETE /openai/conversations/:id`
- `POST /openai/conversations/:id/messages` — SSE streaming (rate limited: 30 req/min)
- `POST /openai/checkin-message` — Post-checkin Luna greeting (rate limited)
- `POST /openai/suggest-tasks` — Luna task suggestions (rate limited)
- `POST /openai/weekly-recap` — Weekly summary (rate limited)
- `GET /healthz`

## Key Features
- **Luna AI Chat**: Streams responses via SSE, knows user's cycle phase, energy (/5), sleep, symptoms, and tasks. Parses `[TASKS:{...}]` blocks for auto task creation.
- **Cycle Phase Tracking**: Menstrual / Follicular / Ovulation / Luteal with energy/mood/tip cards
- **Symptom Tracking**: Per-day AsyncStorage symptom picker, injected into Luna context
- **Monthly Calendar**: Days color-coded by predicted cycle phase
- **Daily Check-in**: Sleep hours, energy (1–5), mood logging
- **Task Management**: Across three views (today/week/month), by category, with completion tracking
- **Cycle/Period Length Settings**: User-configurable in Profile (21–40 day cycle, 2–8 day period)

## QueryClient Config
- staleTime: 5 min, gcTime: 10 min, retry: 1 — prevents tab-switch re-fetches

## Known Pre-existing Issues (not caused by this session)
- lib/api-zod has duplicate export names (re-export naming collision) — `pnpm run typecheck:libs` fails
- lib/integrations-openai-ai-react missing react types — pre-existing
- No userId/auth — app is single-user only

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Session secret
- `PORT` — Assigned per workflow
- `BASE_PATH` — Assigned per workflow
- OpenAI key managed via Replit AI Integration
