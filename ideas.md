# CourseFlow Ideas

This file collects product and UI/UX improvement ideas for future CourseFlow iterations.

## Product Direction

CourseFlow is currently strong for managing projects, calendar events, weekly scheduling, and habits. The next design challenge is supporting longer-running study projects without letting completed work and flat task lists crowd the main workflow.

The guiding principle should be: the first screen should answer "What should I do today?", while project pages should answer "Where am I in this larger learning goal?"

## High Priority

### 1. Project Archive

Add an archive state for projects so completed projects no longer occupy primary Dashboard and Projects space.

Status: implemented. Current behavior supports active/archived project views, archive/restore actions, and hides archived projects from the primary Dashboard and scheduling surfaces.

Recommended behavior:

- Add project status: `active` / `archived`.
- Dashboard hides archived projects by default.
- Projects page has separate views or filters for active and archived projects.
- Allow archived projects to be restored.
- Avoid instantly hiding a project with no explanation.
- Only treat a project as complete when `total > 0` and all related tasks are completed.

Design note: automatic archiving should probably be a prompt or "ready to archive" state first, not an immediate disappearance. Immediate disappearance can make users feel like data was lost.

### 2. Milestones Under Projects

Add milestones as a middle layer between projects and events/tasks.

Status: implemented. Current behavior includes milestone data, project detail milestone management, and task-to-milestone assignment.

Suggested structure:

```text
Project
  Milestone
    Event / Task
```

Milestone fields to consider:

- Name
- Sort order
- Status: not started / active / completed
- Optional target date
- Progress: completed task count / total task count
- Current milestone marker

UI ideas:

- Project cards should show current milestone, not just total progress.
- Dashboard tasks should optionally display their milestone.
- Project detail view should group tasks by milestone.
- Auto-scheduling should be able to prioritize the current milestone.

Example project card:

```text
Machine Learning
Current: Linear Models
12 / 20 completed
Next: Neural Networks
```

## Medium Priority

### 3. Today Execution View

Dashboard currently works mainly as a monthly calendar. Add a stronger "today" workflow.

Status: implemented. Dashboard now has a today workbench with quick add, today's tasks, overdue tasks, unscheduled tasks, and today's habits.

Useful sections:

- Today's tasks
- Overdue tasks
- Unscheduled tasks
- Today's habits
- Quick add task

Design goal: when opening the app, the user should immediately know what to work on next.

### 4. Separate Scheduled Date and Due Date

Current events have one `date`. For study planning, this can become limiting.

Status: implemented. Events keep `date` as the scheduled work date and now have an optional `due_date` deadline. Dashboard editing, project task creation, backup import/export, and overdue queries understand the separate deadline field.

Consider separating:

- `scheduled_date`: when the user plans to work on it
- `due_date`: deadline or target completion date
- `completed_at`: actual completion timestamp

This would support deadlines, overdue states, better statistics, and more reliable rescheduling.

### 5. Dashboard Weekly View

Add a weekly view to the Dashboard so the user can see this week's workload more clearly than in the monthly calendar.

Status: implemented. Dashboard now supports month/week switching, week navigation, and seven-day task columns while keeping the today workbench visible.

Useful behavior:

- Toggle between month view and week view on Dashboard.
- Show seven day columns for the current week.
- Keep today's workbench visible above the week view.
- Show tasks grouped by day, including completed and incomplete states.
- Highlight overdue tasks and unscheduled tasks separately.
- Support quick movement of tasks between days later, possibly by drag and drop.

Design goal: the monthly calendar is good for orientation, while the weekly view should support near-term execution and workload balancing.

### 6. Auto-Scheduling Preview and Undo

Weekly auto-reschedule is useful but can feel opaque when it moves many tasks.

Status: implemented. Weekly scheduling now generates a preview of task date changes before applying them, and the last applied reschedule can be undone.

Future improvements:

- Preview before applying reschedule.
- Show which tasks will move to which dates.
- Undo last reschedule.
- Max tasks per day.
- Skip weekends option.
- Prioritize current milestone.

Design goal: keep auto-scheduling powerful but explainable.

### 7. Project Detail Page

The Projects page currently uses dialogs for task lists. As projects grow, a dedicated project detail page will scale better.

Status: implemented as the first dedicated project detail view, focused on milestones and task grouping.

Possible layout:

```text
Project List
  Project Detail
    Overview
    Milestones
    Tasks
    Statistics
    Settings
```

This avoids putting too much functionality into modal dialogs.

### 8. Search and Filters

Add search and filtering once task/project counts grow.

Status: implemented. Projects can now be searched and filtered by progress on the Projects page; project task dialogs support text, status, and schedule filters; project detail tasks support text, completion, schedule, and milestone filters.

Useful filters:

- Active projects
- Archived projects
- Incomplete tasks
- Completed tasks
- Unscheduled tasks
- Tasks by milestone
- Tasks by project

## Follow-up Small Improvements

These are smaller follow-up points discovered while implementing the main ideas above.

- Project cards should show the current milestone and next milestone. Status: implemented.
- Dashboard task rows should optionally display milestone labels. Status: implemented.
- Auto-scheduling should prioritize the current milestone when possible.
- Auto-scheduling should expose max tasks per day and skip weekends options.
- Weekly view should support quick movement of tasks between days, ideally by drag and drop. Status: implemented.
- Project detail can add overview, statistics, settings, and an optional milestone-grouped task view. Status: implemented.
- Add `completed_at` later if completion-time analytics become important. Status: implemented.
- Replace the current native-looking-but-custom-styled `select` and `date` inputs with a more consistent picker UI, especially for milestone selection and due/target dates. Status: implemented for current `select` and `date` controls.
- Add batch milestone assignment for selected tasks, ideally from both project task dialogs and the project detail page. Status: implemented.
- Dashboard should open in week view by default, with the week/month toggle ordered as week first and month second. Status: implemented.
- Integrate batch add and project completion/archive actions into the project detail page so project-level work can be handled from one place. Status: implemented.
- Move task creation, task list review, and batch completion changes out of project cards and into the project detail page. Status: implemented. Project cards no longer expose add/view task entry points; selected tasks in project detail can be batch marked complete or incomplete.

## UI / Information Architecture Improvements

These ideas focus on making the app feel more coherent, easier to scan, and less modal-heavy.

1. Project cards should open project detail as their primary click action instead of opening edit mode. Status: implemented.
2. Standardize wording between "task", "event", "schedule", and "calendar item" so project contexts use task-oriented language and calendar contexts use schedule-oriented language. Status: implemented for visible project-facing UI.
3. Make the project detail task action bar sticky, especially when tasks are selected, so batch actions remain visible while scrolling long task lists. Status: implemented.
4. Improve project detail task rows with clearer visual hierarchy for title, milestone, scheduled date, due date, overdue, and today-due states. Status: implemented.
5. Turn the project detail overview into a more actionable project cockpit with current milestone, next recommended tasks, overdue tasks, unassigned tasks, and archive readiness. Status: implemented.
6. Improve batch selection feedback with a summary such as selected count, completed count, and open count. Status: implemented.
7. Reduce visual weight for archived projects so they read more like historical records than active work. Status: implemented.
8. Separate project settings from lifecycle or dangerous actions such as archive, restore, and delete. Status: implemented.
9. Add Dashboard weekly-view density controls and visibility filters such as compact/comfortable, hide completed, and project-colored task accents. Status: implemented.
10. Reduce excessive card/floating-surface styling where a denser workbench layout would improve scanning and repeated use. Status: implemented.
11. Add a Settings preference to switch Dashboard between the denser workbench/table layout and the older rounded card layout for Today's Workbench, week view, and month view. Status: implemented.

## Low Priority / Polish

### 9. Unified Daily Work Items

Habits and study tasks are currently separated. Dashboard should eventually present both as today's execution items.

Status: implemented. Dashboard now has a unified "today execution" list that mixes today's scheduled tasks and today's scheduled habits, with one completion count and inline completion toggles.

This reduces switching between Dashboard and Habits when planning the day.

### 10. Local Date Handling

Some date helpers use `toISOString().slice(0, 10)`. In local timezones, especially near midnight, this can produce the previous or next date because `toISOString()` uses UTC.

Status: implemented for the previously identified Dashboard and import date paths.

Recommendation:

- Prefer local date formatting helpers based on `getFullYear()`, `getMonth()`, and `getDate()`.
- Audit calendar, import, and scheduling code for UTC/local date mismatches.

This matters because calendar software loses user trust quickly if "today" is wrong.

## Suggested Next Iteration Order

1. Fix local date handling.
2. Add project archive state and active/archived filters.
3. Design milestone schema and project detail page.
4. Add Today execution view.
5. Add Dashboard weekly view.
6. Add auto-scheduling preview/undo.
7. Add search and filters.
