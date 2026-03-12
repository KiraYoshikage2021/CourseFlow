# CourseFlow

A desktop productivity app for managing study schedules, projects, and habits. Built with Tauri 2.0 (Rust + React/TypeScript).

## Features

- **Dashboard** — Daily overview with event list, project progress, and quick navigation across dates
- **Projects** — Manage study subjects with color coding, difficulty levels, and priority ordering. Add individual or batch events per project
- **Weekly Schedule** — Assign projects to specific days of the week as a recurring template, with auto-scheduling support
- **Habits** — Track recurring habits with per-day-of-week scheduling, check-in/undo, streak counter, and a 12-week history heatmap
- **Import** — Restore from backup (JSON) or migrate from a Flutter version of the app
- **Dark / Light mode**

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop shell | Tauri 2.0 |
| Backend | Rust, SQLx, SQLite |
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Routing | React Router v6 |
| Drag & drop | dnd-kit |

## Development

**Prerequisites:** Rust toolchain, Node.js 18+

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Data Storage

The SQLite database (`courseflow_data.db`) is stored alongside the executable. It is **not** committed to this repository.

Database tables:
- `projects` — study subjects with color, priority, difficulty
- `calendar_events` — scheduled and unscheduled events
- `weekly_template` — recurring weekly project assignments
- `habits` — habit definitions with scheduled days
- `habit_completions` — per-date check-in records

## Changelog

### v2.4.0
- Added **Habits** page: create habits with custom schedules (per day of week), check-in / undo, streak tracking, and 12-week history heatmap with completion stats

### v2.1.0 – v2.3.x
- Weekly schedule template with auto-reschedule
- Batch event creation (same name / numbered)
- Event pinning and bulk operations
- Flutter backup import
- Day/Night mode toggle
- Various bug fixes and UI improvements
