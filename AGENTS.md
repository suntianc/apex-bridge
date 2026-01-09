# AGENTS.md

## Commands

```bash
# Build & Run
npm run dev          # Dev server with nodemon
npm run build        # Compile TypeScript
npm run start        # Run compiled server

# Testing
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage
npm test -- --testPathPattern="filename.test.ts"  # Single test file

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix issues
npm run format       # Format with Prettier
npm run format:check # Check formatting

# Database
npm run migrations       # Run migrations
```

## Code Style

- **Quotes**: Single quotes (`'...'`) for JS/TS, double quotes for JSON
- **Semicolons**: Required
- **Indent**: 2 spaces (no tabs)
- **Line width**: 100 chars
- **Arrow parens**: Always
- **Imports**: Alphabetical order, absolute paths via `@/` alias (maps to `src/`)
- **Classes**: PascalCase; private members with `_` prefix convention
- **Comments**: Chinese for public APIs, English for internal implementation
- **Types**: No `as any`, `@ts-ignore`, `@ts-expect-error`; prefer explicit types
- **Error handling**: Never leave empty catch blocks; use logger for errors
- **Config**: `noImplicitAny: false`, `strictNullChecks: false` (non-strict TS)
