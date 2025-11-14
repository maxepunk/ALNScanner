# Pre-ES6 Migration Documentation Archive

This directory contains documentation for the **single-file HTML architecture** that was migrated to ES6 modules in November 2025.

## Why Archived?

These documents describe the **old architecture** (20+ script tags, single `index.html` file) that no longer exists after the ES6 module migration. They are preserved for historical reference but should **not be used** for current development.

## What Changed?

**Before (Single-File Architecture)**:
- Single `index.html` file with 20+ `<script>` tags
- Global namespace pollution (`window.App`, `window.DataManager`, etc.)
- Imperative initialization sequence
- No build process
- Direct file:// opening supported

**After (ES6 Module Architecture)**:
- Modular `src/` directory with `import`/`export`
- Clean module boundaries via dependency injection
- Event-driven initialization
- Vite build system with hot module reload
- Must use `npm run dev` (no direct file opening)

See [2025-11-11-es6-module-migration.md](../../plans/2025-11-11-es6-module-migration.md) for complete migration details.

## Archived Files

### UI Documentation (Single-File Era)
- **UI_SCREEN_FLOW_DIAGRAMS.md** - 10 ASCII diagrams of screen flows
- **UI_DOCUMENTATION_INDEX.md** - Master index of UI documentation
- **UI_STRUCTURE_MAP.md** - Technical reference with line numbers
- **UI_MAP_SUMMARY.md** - Quick reference guide

**Why Archived**: Documents line numbers and structure of single `index.html` file that no longer exists. Modern structure documented in CLAUDE.md § Frontend Architecture.

### Admin Panel Documentation (Single-File Era)
- **ADMIN_PANEL_DEEP_ANALYSIS.md** - Deep dive into admin module implementation
- **ADMIN_INTERFACE_QUICK_REFERENCE.md** - Admin UI reference
- **ADMIN_EXPLORATION_README.md** - Admin module exploration guide

**Why Archived**: References global `window.adminModule` and inline script structure. Modern admin architecture documented in CLAUDE.md § Admin Panel.

## Current Documentation

For current architecture and development, see:

### Primary Documentation
- **[CLAUDE.md](../../../CLAUDE.md)** - Complete technical reference for ES6 architecture
- **[README.md](../../../README.md)** - User-facing documentation with ES6 workflow
- **[2025-11-11-es6-module-migration.md](../../plans/2025-11-11-es6-module-migration.md)** - Migration plan and details

### Active Documentation (docs/)
- **[NETWORKED_MODE_QUICK_REFERENCE.md](../../NETWORKED_MODE_QUICK_REFERENCE.md)** - Still valid (networking unchanged)
- **[NETWORKED_MODE_USER_FLOW.md](../../NETWORKED_MODE_USER_FLOW.md)** - Still valid (user flow unchanged)
- **[NETWORKED_MODE_VISUAL_GUIDE.md](../../NETWORKED_MODE_VISUAL_GUIDE.md)** - Still valid (UI unchanged)
- **[SUBMODULE_INFO.md](../../SUBMODULE_INFO.md)** - Still valid (token database unchanged)

### Testing Documentation
- **[CLAUDE.md § Testing Architecture](../../../CLAUDE.md#testing-architecture)** - L1/L2/L3 test taxonomy
- **[README.md § Testing](../../../README.md#-testing)** - Test commands and workflow
- **tests/unit/** - 598 Jest unit tests with inline documentation
- **tests/e2e/specs/** - Playwright E2E test scenarios

## Migration Timeline

- **October 2025**: Single-file architecture with inline scripts
- **November 6-11, 2025**: ES6 module migration (PR #4)
  - Day 1: Setup (Vite, Babel, test infrastructure)
  - Day 2-3: Module extraction (20 modules)
  - Day 4: Test fixes (598/598 passing)
  - Day 5: Documentation updates
- **November 12, 2025**: Documentation archived to this directory

## Historical Context

These documents were **highly valuable** during the single-file era:
- Provided searchable reference by line number
- Documented complex inline initialization sequence
- Explained global namespace relationships
- Mapped 9 screens across 2116 lines of HTML

The migration to ES6 modules made these references obsolete because:
- Line numbers changed (new file structure)
- Global namespace eliminated (proper modules)
- Initialization simplified (event-driven)
- Structure clarified (separate files)

## Restoration Notice

**Do NOT restore these files to active documentation.**

If you need to reference the old architecture:
1. Check this archive directory
2. View git history: `git log --before="2025-11-06" -- index.html`
3. See migration plan: `docs/plans/2025-11-11-es6-module-migration.md`

For any questions about current architecture, consult CLAUDE.md or README.md.

---

**Archive Created**: November 12, 2025
**Migration PR**: #4 (scanner) + #5 (parent repo)
**Migration Lead**: Claude Code + User
**Reason**: ES6 module architecture replaced single-file HTML architecture
