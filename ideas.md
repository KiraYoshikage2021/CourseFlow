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

### 9. Spaced Review Reminders

Add a review reminder system based on a modern spaced repetition algorithm.

Status: MVP implemented. Completed tasks are backfilled into a review plan on startup, newly completed tasks default to review, Project Detail allows manual review opt-out, Dashboard shows due review items, and reviews support forgot / hard / good / easy ratings with review logs.

Useful behavior:

- Allow completed tasks or selected project items to be added to a review plan.
- Show due review items on Dashboard.
- Let the user rate recall as forgot / hard / good / easy.
- Use the rating to calculate the next review date.
- Keep review logs for future statistics and parameter tuning.

Remaining follow-ups:

- Add optional system notifications and a preferred reminder time.
- Add review statistics once enough review history exists. Status: implemented as a Dashboard summary with active review count, due/overdue counts, reviewed counts, 30-day rating retention, and 7-day review load.
- Replace the current FSRS-compatible MVP scheduler with a full FSRS library/parameter optimization if needed. Status: implemented with FSRS-5 19-weight scheduling, local review-log parameter optimization, Settings-page optimization control, and backup/export of FSRS settings.

### 10. Project Task Ordering

Status: implemented. Task ordering now uses persistent `calendar_events.sort_order`, initial backfill for existing tasks, Project Detail auto-sort options, backup/import support, auto-scheduling reading project tasks by `sort_order`, and manual drag reordering in the flat unfiltered Project Detail task list.

Problem:

Project tasks currently rely mostly on creation time, scheduled date, milestone grouping, and completion state. When a project grows, this can make the task order drift away from the intended learning or execution order. Auto-scheduling then inherits the wrong order, so tasks may be placed into the weekly plan in a sequence that does not match how the project should actually be done.

Goal:

- Add a stable task order inside each project.
- Support automatic ordering for common cases, such as milestone order, due date, scheduled date, completion state, and creation time.
- Support manual ordering when the user wants to override the automatic order.
- Make auto-scheduling consume the same project task order so the visible project order and generated schedule stay consistent.

Implementation approach:

- Add a `sort_order` column to `calendar_events`, scoped by `project_id`. Backfill existing project tasks by current project order: milestone sort order, uncompleted before completed, scheduled date, due date, creation time.
- Update project task queries to order by `sort_order` first, then stable fallbacks.
- Add task reordering commands, for example `reorder_project_tasks(project_id, ordered_event_ids)`.
- In Project Detail, add drag handles for manual ordering in the flat task list and probably within each milestone group. Disable or clearly constrain drag reorder when a filtered/search view is active.
- Add an "auto sort" action with options such as by milestone, task name, due date, scheduled date, incomplete first, or created time. Task-name sorting is useful after generating `{原任务名}：巩固练习` tasks because each practice task can stay adjacent to its source task. Auto sort should write the resulting `sort_order`, not just change the temporary UI sort.
- Update auto-scheduling so it pulls unscheduled project tasks in `sort_order` order, optionally prioritizing the current milestone first.
- Backup/import should include `sort_order` so the user does not lose manual task order.

### 11. Batch Generate Consolidation Practice Tasks

Status: implemented as an MVP. Project Detail selected-task batch actions can generate `{原任务名}：巩固练习` tasks. Generated practice tasks inherit the same project and milestone, stay unscheduled by default, and duplicate matching practice tasks are skipped automatically.

Problem:

After finishing a batch of study tasks, the app can already send completed tasks into the review system, but it does not help the user create concrete follow-up practice work. Some learning workflows need a separate "consolidation practice" task for each selected task, for example exercises, past-paper questions, recitation, or active recall practice tied to the original item.

Goal:

- Let the user select multiple project tasks and generate one matching "consolidation practice" task for each selected task.
- Keep generated tasks linked to the same project and milestone by default.
- Make the generated task names predictable and editable enough to avoid noisy duplicates.
- Optionally schedule the generated tasks later, send them into review when completed, and keep them separate from the source tasks.

Implementation approach:

- Add a Project Detail batch action: "Generate practice tasks" for selected tasks.
- Start with an MVP that creates unscheduled tasks named `{source task title}: consolidation practice` or, in Chinese UI, `{原任务名}：巩固练习`. Keeping the source title first makes alphabetical/manual-adjacent ordering easier because the practice task stays near the original task instead of grouping every practice task under the same prefix.
- Copy `project_id` and `milestone_id` from each source task. Leave `date` null by default so they enter the unscheduled queue; optionally set `due_date` based on a simple offset such as tomorrow or three days later.
- Add a confirmation side panel before creation, showing the generated task list, duplicate warnings, and options:
  - naming prefix
  - keep same milestone
  - due date offset
  - skip tasks that already have a matching practice task
- To prevent duplicate generation, add a lightweight relationship field later if needed, such as `source_event_id` plus `task_type = practice`; for the MVP, duplicate detection can match same project, same milestone, and same generated title.
- Generated practice tasks should participate in existing batch completion, review enrollment, weekly scheduling, and project statistics without special-case UI.

Follow-up improvements:

- Add undo after batch generation, for example `已生成 X 个 · 撤销`, deleting only the tasks created in the latest generation action. Status: implemented.
- Add a generation preview side panel before creation, showing tasks that will be created, duplicates that will be skipped, whether milestone is inherited, and optional due-date offset. Status: implemented.
- After generating practice tasks, suggest or optionally apply task-name sorting so source tasks and `{原任务名}：巩固练习` stay adjacent. Status: implemented as a preview option, enabled by default.
- Add project-level learning-loop statistics: source task count, consolidation practice count, completed practice ratio, and due review count. This helps distinguish "heard the lesson" from "practiced and retained it". Status: implemented in Project Detail statistics.

## Follow-up Small Improvements

These are smaller follow-up points discovered while implementing the main ideas above.

- Project cards should show the current milestone and next milestone. Status: implemented.
- Dashboard task rows should optionally display milestone labels. Status: implemented.
- Auto-scheduling should prioritize the current milestone when possible.
- Auto-scheduling should expose max tasks per day and skip weekends options.
- Auto-scheduling should become more constrained and explainable: max tasks per day, skip weekends, and prioritize current milestone should be presented as explicit user-controlled options rather than hidden behavior.
- Review reminders should support optional system notifications and a preferred reminder time, ideally opening the dedicated Review page when clicked.
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
12. Add richer completion feedback with animated checkmarks, lightweight celebration, and optional crisp completion sound. Status: implemented.
13. Audit modal-heavy workflows and replace high-frequency, information-dense dialogs with side panels, inline sections, or split views. Keep modal dialogs for destructive confirmations and short one-off actions. Status: first pass implemented for Dashboard day management, Project Detail milestone edit / batch add, Weekly Schedule reschedule preview, and Habit history statistics.
14. Make desktop/fullscreen layouts use available width, especially Projects and Weekly Schedule. Projects should feel like a workspace with filters and the project list side by side; Weekly Schedule should use a seven-column planning surface instead of a narrow vertical strip. Status: implemented for Projects and Weekly Schedule.
15. Move full review workflow into a dedicated Review page while keeping Dashboard as a lightweight daily summary. Remove low-value Dashboard quick-add controls so the first screen stays focused on execution, review, overdue, and unscheduled work. Status: implemented.

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
