# ALNScanner Documentation Index

> **Quick Start**: For AI assistants, start with `CLAUDE.md` for codebase context and development guidance.

## Tier 1: Entry Points

| Document | Purpose |
|----------|---------|
| [`CLAUDE.md`](CLAUDE.md) | Primary AI context - architecture, commands, patterns |
| [`../CLAUDE.md`](../CLAUDE.md) | Parent ecosystem context - cross-cutting concerns |

## Tier 2: Architecture & Patterns

### Core Architecture

| Document | Purpose |
|----------|---------|
| [`docs/NETWORKED_MODE_USER_FLOW.md`](docs/NETWORKED_MODE_USER_FLOW.md) | Complete networked mode flow with line numbers |
| [`docs/NETWORKED_MODE_QUICK_REFERENCE.md`](docs/NETWORKED_MODE_QUICK_REFERENCE.md) | Quick reference for networked mode |

### UI/UX Documentation

| Document | Purpose |
|----------|---------|
| [`docs/UI_TESTING_REFERENCE.md`](docs/UI_TESTING_REFERENCE.md) | Playwright selectors, navigation flows, page object patterns |
| [`docs/UI_ARCHITECTURE.md`](docs/UI_ARCHITECTURE.md) | Conceptual overview: screens, views, event routing, mode selection |

## Tier 3: Testing & Development

| Document | Purpose |
|----------|---------|
| [`docs/PLAYWRIGHT_TESTING_GUIDE.md`](docs/PLAYWRIGHT_TESTING_GUIDE.md) | E2E testing patterns and examples |
| [`MAINTENANCE.md`](MAINTENANCE.md) | Token sync and maintenance procedures |

## Tier 4: Backend Integration

| Document | Purpose |
|----------|---------|
| [`../backend/CLAUDE.md`](../backend/CLAUDE.md) | Backend orchestrator architecture |
| [`../backend/contracts/README.md`](../backend/contracts/README.md) | API contract documentation |
| [`../docs/SCORING_LOGIC.md`](../docs/SCORING_LOGIC.md) | Scoring business logic (source of truth) |

## Key File Locations

### Source Code (ES6 Modules)
```
src/
├── app/               # App layer (App.js, SessionModeManager)
├── core/              # Business logic
│   ├── unifiedDataManager.js  # Facade for storage strategies
│   ├── storage/               # Strategy implementations
│   │   ├── LocalStorage.js    # Standalone mode
│   │   └── NetworkedStorage.js # Networked mode
│   ├── scoring.js             # Scoring config
│   └── tokenManager.js        # Token database
├── network/           # WebSocket layer
├── ui/                # UI management
├── admin/             # Admin panel modules
└── utils/             # Utilities (NFC, debug, etc.)
```

### Tests
```
tests/
├── unit/              # Jest unit tests (759 tests)
└── e2e/               # Playwright E2E tests
```

## Document Maintenance

**When to update:**
- After significant architecture changes
- When adding new screens or features
- When file paths change

**Update checklist:**
1. Update `CLAUDE.md` for AI context
2. Update relevant tier docs for specific changes
3. Verify all links still work
