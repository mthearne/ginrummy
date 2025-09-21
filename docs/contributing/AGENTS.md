# Repository Guidelines

## Project Structure & Module Organization
- `app/` is the Next.js 14 surface: API handlers in `app/api/`, lobby and gameplay UI in `app/lobby` and `app/game`, auth pages in `app/login` and `app/register`.
- `src/` houses the standalone React client; shared UI sits in `src/components`, state in `src/store`, and service calls in `src/services`.
- Shared logic lives in `packages/common` (TypeScript utilities, Prisma types) and `lib/` (server helpers); rerun `pnpm db:generate` after editing `prisma/schema.prisma`.
- Tests live in `__tests__/` (component/store coverage) and `tests/` (API, integration, social, security, performance); supporting docs are under `docs/`.

## Build, Test, and Development Commands
- `pnpm install` syncs workspace dependencies; `pnpm dev` starts the Next dev server on http://localhost:3000.
- `pnpm build` generates Prisma clients, builds `packages/common`, and compiles the production bundle; `pnpm start` serves it.
- Database workflow: `pnpm db:migrate` for migrations, `pnpm db:seed` for demo data, `pnpm db:studio` for Prisma Studio.
- Quality gates: `pnpm lint` (root `.eslintrc.cjs`), `pnpm type-check`, and `pnpm test` or targeted suites such as `pnpm test:api`.

## Coding Style & Naming Conventions
- TypeScript everywhere with ES modules, async/await, and 2-space indentation enforced by ESLint + Prettier (`pnpm lint --fix`).
- Components use PascalCase, hooks camelCase prefixed with `use`, Prisma models singular PascalCase, and test files follow feature names (`lobby-matchmaking.spec.ts`).
- Compose UI with Tailwind utilities and Headless UI patterns already present in `app/` and `src/components`.

## Testing Guidelines
- Vitest powers unit and integration suites; add focussed tests beside feature folders and run `pnpm test:coverage` before a PR.
- Playwright (`pnpm test:e2e` or `pnpm test:e2e:ui`) covers end-to-end flows—refresh recordings when lobby or game UX changes.
- Store fixtures under `tests/__fixtures__` and reseed with `pnpm db:seed` ahead of smoke checks.

## Commit & Pull Request Guidelines
- Follow the emoji-tagged commit style (`🎯 FEAT:`, `🔧 FIX:`, `🎨 IMPROVE:`) in present tense and keep subjects under ~70 characters.
- Squash before merge, ensure lint, type-check, and impacted tests pass, and call out schema or contract changes in the description.
- PRs should link issues, list verification commands with results, and add screenshots or clips for UI updates.

## Environment & Tooling Tips
- Use Node 18+ and pnpm 9.x as enforced in `package.json`; run commands from the repository root to respect workspace paths.
- Manage secrets through `.env.local`; avoid committing credentials and rotate keys after using shared playground environments.
- Snapshot tuning: use `GAME_SNAPSHOT_ENABLED`, `GAME_SNAPSHOT_INTERVAL`, `GAME_SNAPSHOT_FORCE_EVENTS`, and `GAME_SNAPSHOT_RETENTION` to balance replay performance and storage.
