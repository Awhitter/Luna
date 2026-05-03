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
- **Color Theme**: Warm rose / dusty mauve (`--primary: 345 35% 62%` / `#c0788a`)
- **API**: Express.js, Drizzle ORM, PostgreSQL
- **AI**: OpenAI GPT (via Replit AI Integration), streaming SSE responses

## Pages
- `/` — Today: AI chat with Aria + today's task list + quick check-in
- `/week` — Week: Tasks organized by category with progress bar
- `/month` — Month: Calendar with cycle phase color coding + monthly tasks
- `/cycle` — Cycle Tracker: Current phase card + logging + phase visualization
- `/settings` — Profile: Onboarding + settings (name, kids, schedule, cycle)

## Database Tables
- `profiles` — User profile (name, hasKids, workSchedule, cycleLength, etc.)
- `tasks` — Tasks with category, priority, view (today/week/month), completed
- `cycle_entries` — Period start/end, ovulation, symptoms, notes
- `daily_contexts` — Daily sleep, energy level (1-10), mood log
- `conversations` — AI chat conversation sessions
- `messages` — Chat messages (stored after conversation)

## API Routes
All routes prefixed with `/api`:
- `GET/POST/PUT /profile`
- `GET/POST /tasks`, `GET/PUT/DELETE /tasks/:id`, `GET /tasks/summary`
- `GET /cycle/entries`, `POST /cycle/entries`, `GET /cycle/current-phase`
- `GET/POST /daily-context/entries`, `GET /daily-context/today`
- `GET/POST /openai/conversations`, `GET/DELETE /openai/conversations/:id`
- `POST /openai/conversations/:id/messages` — SSE streaming endpoint
- `GET /healthz`

## Key Features
- **Aria AI Chat**: Streams responses via SSE, knows user's cycle phase, energy, sleep context. Parses `[TASKS:{...}]` blocks for auto task creation.
- **Cycle Phase Tracking**: Menstrual / Follicular / Ovulation / Luteal with energy/mood/tip cards
- **Monthly Calendar**: Days color-coded by predicted cycle phase
- **Daily Check-in**: Sleep hours, energy (1-10), mood logging via bottom sheet modals
- **Task Management**: Across three views (today/week/month), by category, with completion tracking

## Seed Data
Initial seed: Sofia (2 kids, 9-5 schedule), cycle started ~10 days ago (Follicular phase), sleep=6.5h, energy=7, mood=motivated, 13 tasks distributed across today/week/month.

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Session secret
- `PORT` — Assigned per workflow
- `BASE_PATH` — Assigned per workflow
- OpenAI key managed via Replit AI Integration
