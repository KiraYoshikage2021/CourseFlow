use crate::models::*;
use chrono::{Datelike, Duration, NaiveDate, Utc};
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};
use std::cmp::Ordering;
use tauri::State;
use uuid::Uuid;

fn row_to_calendar_event(r: &SqliteRow) -> CalendarEvent {
    CalendarEvent {
        id: r.get("id"),
        title: r.get("title"),
        date: r.get("date"),
        due_date: r.get("due_date"),
        created_at: r.get("created_at"),
        completed_at: r.get("completed_at"),
        is_completed: r.get::<i64, _>("is_completed") != 0,
        is_pinned: r.get::<i64, _>("is_pinned") != 0,
        project_id: r.get("project_id"),
        milestone_id: r.get("milestone_id"),
        sort_order: r.get("sort_order"),
    }
}

fn row_to_review_item(r: &SqliteRow) -> ReviewItem {
    ReviewItem {
        id: r.get("id"),
        title: r.get("title"),
        source_event_id: r.get("source_event_id"),
        project_id: r.get("project_id"),
        milestone_id: r.get("milestone_id"),
        created_at: r.get("created_at"),
        is_active: r.get::<i64, _>("is_active") != 0,
        due_date: r.get("due_date"),
        last_reviewed_at: r.get("last_reviewed_at"),
        stability: r.get("stability"),
        difficulty: r.get("difficulty"),
        scheduled_days: r.get("scheduled_days"),
        elapsed_days: r.get("elapsed_days"),
        reps: r.get("reps"),
        lapses: r.get("lapses"),
        project_name: r.get("project_name"),
        milestone_name: r.get("milestone_name"),
    }
}

fn parse_ymd(value: &str) -> Option<NaiveDate> {
    value
        .get(0..10)
        .and_then(|date| NaiveDate::parse_from_str(date, "%Y-%m-%d").ok())
}

async fn next_project_event_sort_order(pool: &SqlitePool, project_id: &str) -> Result<i64, String> {
    sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM calendar_events WHERE project_id=?",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())
}

enum NaturalChunk {
    Number(String),
    Text(String),
}

fn next_natural_chunk(
    chars: &mut std::iter::Peekable<std::str::Chars<'_>>,
) -> Option<NaturalChunk> {
    let first = chars.next()?;
    let is_number = first.is_ascii_digit();
    let mut value = String::new();
    value.push(first);

    while let Some(next) = chars.peek() {
        if next.is_ascii_digit() != is_number {
            break;
        }
        value.push(*next);
        chars.next();
    }

    if is_number {
        Some(NaturalChunk::Number(value))
    } else {
        Some(NaturalChunk::Text(value.to_lowercase()))
    }
}

fn compare_numeric_strings(a: &str, b: &str) -> Ordering {
    let a_trimmed = a.trim_start_matches('0');
    let b_trimmed = b.trim_start_matches('0');
    let a_normalized = if a_trimmed.is_empty() { "0" } else { a_trimmed };
    let b_normalized = if b_trimmed.is_empty() { "0" } else { b_trimmed };

    a_normalized
        .len()
        .cmp(&b_normalized.len())
        .then_with(|| a_normalized.cmp(b_normalized))
        .then_with(|| a.len().cmp(&b.len()))
}

fn natural_title_cmp(a: &str, b: &str) -> Ordering {
    let mut a_chars = a.chars().peekable();
    let mut b_chars = b.chars().peekable();

    loop {
        match (
            next_natural_chunk(&mut a_chars),
            next_natural_chunk(&mut b_chars),
        ) {
            (Some(NaturalChunk::Number(a_num)), Some(NaturalChunk::Number(b_num))) => {
                let ordering = compare_numeric_strings(&a_num, &b_num);
                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
            (Some(NaturalChunk::Text(a_text)), Some(NaturalChunk::Text(b_text))) => {
                let ordering = a_text.cmp(&b_text);
                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
            (Some(NaturalChunk::Number(_)), Some(NaturalChunk::Text(_))) => {
                return Ordering::Less;
            }
            (Some(NaturalChunk::Text(_)), Some(NaturalChunk::Number(_))) => {
                return Ordering::Greater;
            }
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (None, None) => return Ordering::Equal,
        }
    }
}

fn row_to_fsrs_settings(r: &SqliteRow) -> FsrsSettings {
    let weights = crate::fsrs::parse_weights(&r.get::<String, _>("fsrs_weights"));
    FsrsSettings {
        desired_retention: r.get("desired_retention"),
        maximum_interval: r.get("maximum_interval"),
        weights: crate::fsrs::weights_to_vec(&weights),
        optimized_at: r.get("optimized_at"),
        optimizer_review_count: r.get("optimizer_review_count"),
        optimizer_loss: r.get("optimizer_loss"),
    }
}

async fn read_fsrs_settings(pool: &SqlitePool) -> Result<FsrsSettings, String> {
    let row = sqlx::query(
        "SELECT desired_retention, maximum_interval, fsrs_weights, optimized_at,
                optimizer_review_count, optimizer_loss
         FROM review_settings WHERE id = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(row_to_fsrs_settings(&row))
}

#[tauri::command]
pub async fn get_projects(pool: State<'_, SqlitePool>) -> Result<Vec<Project>, String> {
    let rows = sqlx::query(
        "SELECT id, name, color_value, priority, difficulty, is_archived FROM projects ORDER BY priority ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| Project {
            id: r.get("id"),
            name: r.get("name"),
            color_value: r.get("color_value"),
            priority: r.get("priority"),
            difficulty: match r.get::<String, _>("difficulty").as_str() {
                "high" => Difficulty::High,
                "medium" => Difficulty::Medium,
                _ => Difficulty::Low,
            },
            is_archived: r.get::<i64, _>("is_archived") != 0,
        })
        .collect())
}

#[tauri::command]
pub async fn add_project(
    pool: State<'_, SqlitePool>,
    name: String,
    color_value: i64,
    difficulty: Difficulty,
) -> Result<Project, String> {
    let id = Uuid::new_v4().to_string();
    let count: i64 = sqlx::query("SELECT COUNT(*) as count FROM projects")
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?
        .get("count");

    // serde rename_all = "lowercase" 保证序列化为小写
    let difficulty_str = serde_json::to_string(&difficulty)
        .map_err(|e| e.to_string())?
        .trim_matches('"')
        .to_string();

    sqlx::query(
        "INSERT INTO projects (id, name, color_value, priority, difficulty, is_archived) VALUES (?, ?, ?, ?, ?, 0)",
    )
    .bind(&id)
    .bind(&name)
    .bind(color_value)
    .bind(count)
    .bind(&difficulty_str)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(Project {
        id,
        name,
        color_value,
        priority: count,
        difficulty,
        is_archived: false,
    })
}

#[tauri::command]
pub async fn update_project(
    pool: State<'_, SqlitePool>,
    id: String,
    name: String,
    color_value: i64,
    difficulty: Difficulty,
) -> Result<(), String> {
    let difficulty_str = serde_json::to_string(&difficulty)
        .map_err(|e| e.to_string())?
        .trim_matches('"')
        .to_string();

    sqlx::query("UPDATE projects SET name=?, color_value=?, difficulty=? WHERE id=?")
        .bind(&name)
        .bind(color_value)
        .bind(&difficulty_str)
        .bind(&id)
        .execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_project(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE calendar_events SET project_id=NULL, milestone_id=NULL WHERE project_id=?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE review_items SET project_id=NULL, milestone_id=NULL WHERE project_id=?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM milestones WHERE project_id=?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM projects WHERE id=?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn archive_project(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    sqlx::query("UPDATE projects SET is_archived=1 WHERE id=?")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_project(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    sqlx::query("UPDATE projects SET is_archived=0 WHERE id=?")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reorder_projects(pool: State<'_, SqlitePool>, ids: Vec<String>) -> Result<(), String> {
    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    for (i, id) in ids.iter().enumerate() {
        sqlx::query("UPDATE projects SET priority=? WHERE id=?")
            .bind(i as i64)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_milestones(
    pool: State<'_, SqlitePool>,
    project_id: String,
) -> Result<Vec<MilestoneWithStats>, String> {
    let rows = sqlx::query(
        "SELECT m.id, m.project_id, m.name, m.sort_order, m.status, m.target_date, m.created_at,
                COUNT(e.id) as total,
                COALESCE(SUM(e.is_completed), 0) as done
         FROM milestones m
         LEFT JOIN calendar_events e ON e.milestone_id = m.id
         WHERE m.project_id = ?
         GROUP BY m.id, m.project_id, m.name, m.sort_order, m.status, m.target_date, m.created_at
         ORDER BY m.sort_order ASC, m.created_at ASC",
    )
    .bind(&project_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| MilestoneWithStats {
            id: r.get("id"),
            project_id: r.get("project_id"),
            name: r.get("name"),
            sort_order: r.get("sort_order"),
            status: r.get("status"),
            target_date: r.get("target_date"),
            created_at: r.get("created_at"),
            total: r.get("total"),
            done: r.get("done"),
        })
        .collect())
}

#[tauri::command]
pub async fn add_milestone(
    pool: State<'_, SqlitePool>,
    project_id: String,
    name: String,
    target_date: Option<String>,
) -> Result<MilestoneWithStats, String> {
    let id = Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    let count: i64 = sqlx::query("SELECT COUNT(*) as count FROM milestones WHERE project_id=?")
        .bind(&project_id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?
        .get("count");

    sqlx::query(
        "INSERT INTO milestones (id, project_id, name, sort_order, status, target_date, created_at)
         VALUES (?, ?, ?, ?, 'not_started', ?, ?)",
    )
    .bind(&id)
    .bind(&project_id)
    .bind(&name)
    .bind(count)
    .bind(&target_date)
    .bind(&created_at)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(MilestoneWithStats {
        id,
        project_id,
        name,
        sort_order: count,
        status: "not_started".to_string(),
        target_date,
        created_at,
        total: 0,
        done: 0,
    })
}

#[tauri::command]
pub async fn update_milestone(
    pool: State<'_, SqlitePool>,
    id: String,
    name: String,
    status: String,
    target_date: Option<String>,
) -> Result<(), String> {
    sqlx::query("UPDATE milestones SET name=?, status=?, target_date=? WHERE id=?")
        .bind(&name)
        .bind(&status)
        .bind(&target_date)
        .bind(&id)
        .execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_milestone(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE calendar_events SET milestone_id=NULL WHERE milestone_id=?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE review_items SET milestone_id=NULL WHERE milestone_id=?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM milestones WHERE id=?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reorder_milestones(
    pool: State<'_, SqlitePool>,
    ids: Vec<String>,
) -> Result<(), String> {
    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    for (i, id) in ids.iter().enumerate() {
        sqlx::query("UPDATE milestones SET sort_order=? WHERE id=?")
            .bind(i as i64)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_events_by_date(
    pool: State<'_, SqlitePool>,
    date: String,
) -> Result<Vec<CalendarEvent>, String> {
    let rows = sqlx::query("SELECT id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id, sort_order FROM calendar_events WHERE date=? ORDER BY created_at")
        .bind(&date)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(row_to_calendar_event).collect())
}

#[tauri::command]
pub async fn get_events_by_month(
    pool: State<'_, SqlitePool>,
    year_month: String,
) -> Result<Vec<CalendarEvent>, String> {
    let pattern = format!("{}%", year_month);
    let rows = sqlx::query("SELECT id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id, sort_order FROM calendar_events WHERE date LIKE ? ORDER BY date, created_at")
        .bind(&pattern)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(row_to_calendar_event).collect())
}

#[tauri::command]
pub async fn get_unscheduled_events(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<CalendarEvent>, String> {
    let rows = sqlx::query(
        "SELECT id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id, sort_order FROM calendar_events WHERE date IS NULL ORDER BY created_at",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(row_to_calendar_event).collect())
}

#[tauri::command]
pub async fn get_events_by_project(
    pool: State<'_, SqlitePool>,
    project_id: String,
) -> Result<Vec<CalendarEvent>, String> {
    let rows = sqlx::query(
        "SELECT id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id, sort_order
         FROM calendar_events
         WHERE project_id=?
         ORDER BY sort_order ASC, created_at ASC",
    )
    .bind(&project_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(row_to_calendar_event).collect())
}

#[tauri::command]
pub async fn get_events_completed_between(
    pool: State<'_, SqlitePool>,
    start: String,
    end: String,
) -> Result<Vec<CalendarEvent>, String> {
    let rows = sqlx::query(
        "SELECT id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id, sort_order
         FROM calendar_events
         WHERE is_completed = 1
           AND completed_at IS NOT NULL
           AND completed_at >= ?
           AND completed_at < ?
         ORDER BY completed_at DESC, created_at DESC",
    )
    .bind(start)
    .bind(end)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(row_to_calendar_event).collect())
}

#[tauri::command]
pub async fn get_overdue_events(
    pool: State<'_, SqlitePool>,
    today: String,
) -> Result<Vec<CalendarEvent>, String> {
    let rows = sqlx::query(
        "SELECT e.id, e.title, e.date, e.due_date, e.created_at, e.completed_at, e.is_completed, e.is_pinned, e.project_id, e.milestone_id, e.sort_order
         FROM calendar_events e
         LEFT JOIN projects p ON p.id = e.project_id
          WHERE (
              e.due_date < ?
              OR (e.due_date IS NULL AND e.date IS NOT NULL AND e.date < ?)
            )
            AND e.is_completed = 0
            AND (e.project_id IS NULL OR p.is_archived = 0)
         ORDER BY COALESCE(e.due_date, e.date) ASC, e.created_at ASC",
    )
    .bind(&today)
    .bind(&today)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(row_to_calendar_event).collect())
}

#[tauri::command]
pub async fn add_event(
    pool: State<'_, SqlitePool>,
    title: String,
    project_id: Option<String>,
    date: Option<String>,
    due_date: Option<String>,
) -> Result<CalendarEvent, String> {
    let id = Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    let sort_order = match project_id.as_deref() {
        Some(project_id) => next_project_event_sort_order(pool.inner(), project_id).await?,
        None => 0,
    };

    sqlx::query(
        "INSERT INTO calendar_events (id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id, sort_order) VALUES (?, ?, ?, ?, ?, NULL, 0, 0, ?, NULL, ?)",
    )
    .bind(&id)
    .bind(&title)
    .bind(&date)
    .bind(&due_date)
    .bind(&created_at)
    .bind(&project_id)
    .bind(sort_order)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(CalendarEvent {
        id,
        title,
        date,
        due_date,
        created_at,
        completed_at: None,
        is_completed: false,
        is_pinned: false,
        project_id,
        milestone_id: None,
        sort_order,
    })
}

#[tauri::command]
pub async fn update_event(
    pool: State<'_, SqlitePool>,
    id: String,
    title: String,
    project_id: Option<String>,
    due_date: Option<String>,
) -> Result<(), String> {
    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    let current_project_id: Option<String> =
        sqlx::query_scalar("SELECT project_id FROM calendar_events WHERE id=?")
            .bind(&id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    let sort_order = if current_project_id != project_id {
        match project_id.as_deref() {
            Some(next_project_id) => sqlx::query_scalar::<_, i64>(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM calendar_events WHERE project_id=?",
            )
            .bind(next_project_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?,
            None => 0,
        }
    } else {
        sqlx::query_scalar::<_, i64>("SELECT sort_order FROM calendar_events WHERE id=?")
            .bind(&id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
    };
    sqlx::query(
        "UPDATE calendar_events SET title=?, project_id=?, due_date=?, sort_order=? WHERE id=?",
    )
    .bind(&title)
    .bind(&project_id)
    .bind(&due_date)
    .bind(sort_order)
    .bind(&id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE review_items SET title=?, project_id=? WHERE source_event_id=?")
        .bind(&title)
        .bind(&project_id)
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reschedule_event(
    pool: State<'_, SqlitePool>,
    id: String,
    date: Option<String>,
) -> Result<(), String> {
    sqlx::query("UPDATE calendar_events SET date=? WHERE id=?")
        .bind(date)
        .bind(id)
        .execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn assign_event_milestone(
    pool: State<'_, SqlitePool>,
    id: String,
    milestone_id: Option<String>,
) -> Result<(), String> {
    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE calendar_events SET milestone_id=? WHERE id=?")
        .bind(&milestone_id)
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE review_items SET milestone_id=? WHERE source_event_id=?")
        .bind(&milestone_id)
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn batch_assign_event_milestone(
    pool: State<'_, SqlitePool>,
    ids: Vec<String>,
    milestone_id: Option<String>,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "UPDATE calendar_events SET milestone_id=? WHERE id IN ({})",
        placeholders
    );
    let review_sql = format!(
        "UPDATE review_items SET milestone_id=? WHERE source_event_id IN ({})",
        placeholders
    );
    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    let mut q = sqlx::query(&sql).bind(&milestone_id);
    for id in &ids {
        q = q.bind(id);
    }
    q.execute(&mut *tx).await.map_err(|e| e.to_string())?;
    let mut review_q = sqlx::query(&review_sql).bind(&milestone_id);
    for id in &ids {
        review_q = review_q.bind(id);
    }
    review_q
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auto_sort_project_tasks(
    pool: State<'_, SqlitePool>,
    project_id: String,
    mode: String,
) -> Result<(), String> {
    if mode == "title" {
        let rows = sqlx::query(
            "SELECT e.id, e.title, e.sort_order, e.created_at
             FROM calendar_events e
             WHERE e.project_id=?",
        )
        .bind(&project_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

        let mut ordered = rows
            .iter()
            .map(|row| {
                (
                    row.get::<String, _>("id"),
                    row.get::<String, _>("title"),
                    row.get::<i64, _>("sort_order"),
                    row.get::<String, _>("created_at"),
                )
            })
            .collect::<Vec<_>>();
        ordered.sort_by(|a, b| {
            natural_title_cmp(&a.1, &b.1)
                .then_with(|| a.2.cmp(&b.2))
                .then_with(|| a.3.cmp(&b.3))
        });

        let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
        for (index, (id, _, _, _)) in ordered.iter().enumerate() {
            sqlx::query("UPDATE calendar_events SET sort_order=? WHERE id=?")
                .bind(index as i64)
                .bind(id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }
        return tx.commit().await.map_err(|e| e.to_string());
    }

    let order_clause = match mode.as_str() {
        "milestone" => {
            "CASE WHEN e.milestone_id IS NULL THEN 1 ELSE 0 END ASC,
             COALESCE(m.sort_order, 9223372036854775807) ASC,
             e.sort_order ASC,
             e.created_at ASC"
        }
        "due_date" => {
            "CASE WHEN e.due_date IS NULL THEN 1 ELSE 0 END ASC,
             e.due_date ASC,
             e.sort_order ASC,
             e.created_at ASC"
        }
        "date" => {
            "CASE WHEN e.date IS NULL THEN 1 ELSE 0 END ASC,
             e.date ASC,
             e.sort_order ASC,
             e.created_at ASC"
        }
        "incomplete_first" => {
            "e.is_completed ASC,
             e.sort_order ASC,
             e.created_at ASC"
        }
        "created_at" => "e.created_at ASC",
        _ => return Err("未知排序方式".into()),
    };

    let sql = format!(
        "SELECT e.id
         FROM calendar_events e
         LEFT JOIN milestones m ON m.id = e.milestone_id
         WHERE e.project_id=?
         ORDER BY {}",
        order_clause
    );
    let rows = sqlx::query(&sql)
        .bind(&project_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    for (index, row) in rows.iter().enumerate() {
        let id: String = row.get("id");
        sqlx::query("UPDATE calendar_events SET sort_order=? WHERE id=?")
            .bind(index as i64)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reorder_project_tasks(
    pool: State<'_, SqlitePool>,
    project_id: String,
    ordered_event_ids: Vec<String>,
) -> Result<(), String> {
    let rows = sqlx::query(
        "SELECT id
         FROM calendar_events
         WHERE project_id=?
         ORDER BY sort_order ASC, created_at ASC",
    )
    .bind(&project_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let current_ids = rows
        .iter()
        .map(|row| row.get::<String, _>("id"))
        .collect::<Vec<_>>();
    let current_id_set = current_ids
        .iter()
        .cloned()
        .collect::<std::collections::HashSet<_>>();
    let mut seen = std::collections::HashSet::new();
    let mut next_order = ordered_event_ids
        .into_iter()
        .filter(|id| current_id_set.contains(id) && seen.insert(id.clone()))
        .collect::<Vec<_>>();

    for id in current_ids {
        if seen.insert(id.clone()) {
            next_order.push(id);
        }
    }

    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    for (index, id) in next_order.iter().enumerate() {
        sqlx::query("UPDATE calendar_events SET sort_order=? WHERE id=? AND project_id=?")
            .bind(index as i64)
            .bind(id)
            .bind(&project_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_event(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    crate::review::delete_review_items_for_events(pool.inner(), &[id.clone()]).await?;
    sqlx::query("DELETE FROM calendar_events WHERE id=?")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_events_batch(
    pool: State<'_, SqlitePool>,
    events: Vec<CalendarEvent>,
) -> Result<usize, String> {
    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    let count = events.len();
    let mut next_sort_by_project = std::collections::HashMap::<String, i64>::new();
    for event in &events {
        let is_completed = event.is_completed as i64;
        let is_pinned = event.is_pinned as i64;
        let sort_order = match &event.project_id {
            Some(project_id) => {
                if event.sort_order > 0 {
                    event.sort_order
                } else {
                    if !next_sort_by_project.contains_key(project_id) {
                        let next = sqlx::query_scalar::<_, i64>(
                            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM calendar_events WHERE project_id=?",
                        )
                        .bind(project_id)
                        .fetch_one(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                        next_sort_by_project.insert(project_id.clone(), next);
                    }
                    let next = next_sort_by_project.get_mut(project_id).unwrap();
                    let assigned = *next;
                    *next += 1;
                    assigned
                }
            }
            None => event.sort_order,
        };
        sqlx::query("INSERT INTO calendar_events (id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(&event.id).bind(&event.title).bind(&event.date).bind(&event.due_date)
            .bind(&event.created_at).bind(&event.completed_at).bind(is_completed).bind(is_pinned).bind(&event.project_id).bind(&event.milestone_id).bind(sort_order)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
pub async fn toggle_event_pinned(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    sqlx::query("UPDATE calendar_events SET is_pinned = 1 - is_pinned WHERE id=?")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_event_complete(
    pool: State<'_, SqlitePool>,
    id: String,
    add_to_review: Option<bool>,
) -> Result<(), String> {
    let was_completed: i64 = sqlx::query("SELECT is_completed FROM calendar_events WHERE id=?")
        .bind(&id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?
        .get("is_completed");
    let completed_at = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE calendar_events
         SET completed_at = CASE WHEN is_completed = 0 THEN ? ELSE NULL END,
             is_completed = 1 - is_completed
         WHERE id=?",
    )
    .bind(completed_at)
    .bind(&id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    if was_completed == 0 {
        if add_to_review.unwrap_or(true) {
            crate::review::ensure_review_items_for_events(pool.inner(), &[id]).await?;
        }
    } else {
        crate::review::deactivate_review_items_for_events(pool.inner(), &[id]).await?;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_events_by_project(
    pool: State<'_, SqlitePool>,
    project_id: String,
) -> Result<(), String> {
    let rows = sqlx::query("SELECT id FROM calendar_events WHERE project_id=?")
        .bind(&project_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    let ids = rows
        .iter()
        .map(|row| row.get::<String, _>("id"))
        .collect::<Vec<_>>();
    crate::review::delete_review_items_for_events(pool.inner(), &ids).await?;
    sqlx::query("DELETE FROM calendar_events WHERE project_id=?")
        .bind(&project_id)
        .execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_weekly_template(
    pool: State<'_, SqlitePool>,
) -> Result<std::collections::HashMap<String, Vec<String>>, String> {
    let rows = sqlx::query(
        "SELECT day_of_week, project_id FROM weekly_template ORDER BY day_of_week, sort_order",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let mut map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for row in &rows {
        let day: i64 = row.get("day_of_week");
        let project_id: String = row.get("project_id");
        map.entry(day.to_string()).or_default().push(project_id);
    }
    Ok(map)
}

#[tauri::command]
pub async fn save_weekly_template(
    pool: State<'_, SqlitePool>,
    schedule: std::collections::HashMap<String, Vec<String>>,
) -> Result<(), String> {
    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM weekly_template")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    for (day, project_ids) in &schedule {
        let day_num: i64 = day.parse().unwrap_or(0);
        for (i, project_id) in project_ids.iter().enumerate() {
            sqlx::query("INSERT INTO weekly_template (day_of_week, project_id, sort_order) VALUES (?, ?, ?)")
                .bind(day_num).bind(project_id).bind(i as i64)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn batch_delete_events(
    pool: State<'_, SqlitePool>,
    ids: Vec<String>,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    crate::review::delete_review_items_for_events(pool.inner(), &ids).await?;
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!("DELETE FROM calendar_events WHERE id IN ({})", placeholders);
    let mut q = sqlx::query(&sql);
    for id in &ids {
        q = q.bind(id);
    }
    q.execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn batch_complete_events(
    pool: State<'_, SqlitePool>,
    ids: Vec<String>,
    add_to_review: Option<bool>,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let completed_at = Utc::now().to_rfc3339();
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "UPDATE calendar_events SET is_completed=1, completed_at=COALESCE(completed_at, ?) WHERE id IN ({})",
        placeholders
    );
    let mut q = sqlx::query(&sql).bind(completed_at);
    for id in &ids {
        q = q.bind(id);
    }
    q.execute(pool.inner()).await.map_err(|e| e.to_string())?;
    if add_to_review.unwrap_or(true) {
        crate::review::ensure_review_items_for_events(pool.inner(), &ids).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn batch_uncomplete_events(
    pool: State<'_, SqlitePool>,
    ids: Vec<String>,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "UPDATE calendar_events SET is_completed=0, completed_at=NULL WHERE id IN ({})",
        placeholders
    );
    let mut q = sqlx::query(&sql);
    for id in &ids {
        q = q.bind(id);
    }
    q.execute(pool.inner()).await.map_err(|e| e.to_string())?;
    crate::review::deactivate_review_items_for_events(pool.inner(), &ids).await?;
    Ok(())
}

/// 新增：查询每个项目的全量统计（total, completed）
#[tauri::command]
pub async fn get_project_stats(
    pool: State<'_, SqlitePool>,
) -> Result<std::collections::HashMap<String, (i64, i64)>, String> {
    let rows = sqlx::query(
        "SELECT project_id, COUNT(*) as total, SUM(is_completed) as done
         FROM calendar_events
         WHERE project_id IS NOT NULL
         GROUP BY project_id",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let mut map = std::collections::HashMap::new();
    for row in &rows {
        let pid: String = row.get("project_id");
        let total: i64 = row.get("total");
        let done: i64 = row.get("done");
        map.insert(pid, (total, done));
    }
    Ok(map)
}

#[tauri::command]
pub async fn reschedule_events(
    pool: State<'_, SqlitePool>,
    // { "1": ["proj_a", "proj_b"], "3": ["proj_a"], ... }  (1=Mon, 7=Sun)
    schedule: std::collections::HashMap<String, Vec<String>>,
) -> Result<u32, String> {
    let managed: std::collections::HashSet<String> =
        schedule.values().flat_map(|v| v.iter().cloned()).collect();

    let today = chrono::Local::now().date_naive();

    // 第一步：把所有有项目归属的未完成事件的 date 清空为 NULL
    // 包括过去未完成的事件（逾期任务也要重新分配）
    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE calendar_events SET date = NULL
         WHERE is_completed = 0
           AND project_id IS NOT NULL
           AND is_pinned = 0
           AND project_id IN (SELECT id FROM projects WHERE is_archived = 0)",
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    // 如果模板为空（所有天都没选项目），到这里就结束
    // 所有事件已回到待分配状态
    if managed.is_empty() {
        return Ok(0);
    }

    // 第二步：取出受管理项目的所有待分配事件（现在 date 都是 NULL 了）
    let rows = sqlx::query(
        "SELECT id, project_id FROM calendar_events
         WHERE is_completed = 0
           AND project_id IS NOT NULL
           AND date IS NULL
           AND project_id IN (SELECT id FROM projects WHERE is_archived = 0)
         ORDER BY project_id ASC, sort_order ASC, created_at ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let mut pending: std::collections::HashMap<String, std::collections::VecDeque<String>> =
        std::collections::HashMap::new();

    for row in &rows {
        let project_id: String = row.get("project_id");
        if managed.contains(&project_id) {
            let id: String = row.get("id");
            pending.entry(project_id).or_default().push_back(id);
        }
    }

    if pending.is_empty() {
        return Ok(0);
    }

    // 第三步：从今天起按模板逐日分配
    let mut assignments: Vec<(String, String)> = Vec::new();
    let mut cursor = today;
    let max_days = 365 * 2;

    for _ in 0..max_days {
        if pending.is_empty() {
            break;
        }
        let weekday = cursor.weekday().number_from_monday().to_string();
        if let Some(project_ids) = schedule.get(&weekday) {
            for pid in project_ids {
                let should_remove = if let Some(queue) = pending.get_mut(pid) {
                    if let Some(event_id) = queue.pop_front() {
                        assignments.push((event_id, cursor.to_string()));
                    }
                    queue.is_empty()
                } else {
                    false
                };
                if should_remove {
                    pending.remove(pid);
                }
            }
        }
        cursor = cursor.succ_opt().ok_or("日期溢出")?;
    }

    // 第四步：用单条 CASE WHEN 语句批量写入新日期
    let count = assignments.len() as u32;
    if count > 0 {
        let case_clauses = assignments
            .iter()
            .map(|_| "WHEN id=? THEN ?")
            .collect::<Vec<_>>()
            .join(" ");
        let in_placeholders = assignments
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "UPDATE calendar_events SET date = CASE {} END WHERE id IN ({})",
            case_clauses, in_placeholders
        );
        let mut q = sqlx::query(&sql);
        for (event_id, date_str) in &assignments {
            q = q.bind(event_id).bind(date_str);
        }
        for (event_id, _) in &assignments {
            q = q.bind(event_id);
        }
        let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;
        q.execute(&mut *tx).await.map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
    }
    Ok(count)
}

async fn build_reschedule_changes(
    pool: &SqlitePool,
    schedule: &std::collections::HashMap<String, Vec<String>>,
) -> Result<Vec<RescheduleChange>, String> {
    let managed: std::collections::HashSet<String> =
        schedule.values().flat_map(|v| v.iter().cloned()).collect();

    let today = chrono::Local::now().date_naive();
    let rows = sqlx::query(
        "SELECT id, title, date, project_id
         FROM calendar_events
         WHERE is_completed = 0
           AND project_id IS NOT NULL
           AND is_pinned = 0
           AND project_id IN (SELECT id FROM projects WHERE is_archived = 0)
         ORDER BY project_id ASC, sort_order ASC, created_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut new_dates: std::collections::HashMap<String, Option<String>> =
        std::collections::HashMap::new();
    let mut pending: std::collections::HashMap<String, std::collections::VecDeque<String>> =
        std::collections::HashMap::new();

    for row in &rows {
        let id: String = row.get("id");
        let project_id: String = row.get("project_id");
        new_dates.insert(id.clone(), None);
        if managed.contains(&project_id) {
            pending.entry(project_id).or_default().push_back(id);
        }
    }

    if !managed.is_empty() && !pending.is_empty() {
        let mut cursor = today;
        let max_days = 365 * 2;

        for _ in 0..max_days {
            if pending.is_empty() {
                break;
            }
            let weekday = cursor.weekday().number_from_monday().to_string();
            if let Some(project_ids) = schedule.get(&weekday) {
                for pid in project_ids {
                    let should_remove = if let Some(queue) = pending.get_mut(pid) {
                        if let Some(event_id) = queue.pop_front() {
                            new_dates.insert(event_id, Some(cursor.to_string()));
                        }
                        queue.is_empty()
                    } else {
                        false
                    };
                    if should_remove {
                        pending.remove(pid);
                    }
                }
            }
            cursor = cursor.succ_opt().ok_or("日期溢出")?;
        }
    }

    let mut changes = Vec::new();
    for row in &rows {
        let id: String = row.get("id");
        let old_date: Option<String> = row.get("date");
        let new_date = new_dates.get(&id).cloned().unwrap_or(None);
        if old_date != new_date {
            changes.push(RescheduleChange {
                id,
                title: row.get("title"),
                project_id: row.get("project_id"),
                old_date,
                new_date,
            });
        }
    }

    Ok(changes)
}

async fn write_reschedule_dates(
    pool: &SqlitePool,
    changes: Vec<RescheduleChange>,
    use_old_dates: bool,
) -> Result<u32, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let count = changes.len() as u32;

    for change in changes {
        let target_date = if use_old_dates {
            change.old_date
        } else {
            change.new_date
        };
        sqlx::query("UPDATE calendar_events SET date=? WHERE id=?")
            .bind(target_date)
            .bind(change.id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
pub async fn preview_reschedule_events(
    pool: State<'_, SqlitePool>,
    schedule: std::collections::HashMap<String, Vec<String>>,
) -> Result<Vec<RescheduleChange>, String> {
    build_reschedule_changes(pool.inner(), &schedule).await
}

#[tauri::command]
pub async fn apply_reschedule_changes(
    pool: State<'_, SqlitePool>,
    changes: Vec<RescheduleChange>,
) -> Result<u32, String> {
    write_reschedule_dates(pool.inner(), changes, false).await
}

#[tauri::command]
pub async fn undo_reschedule_changes(
    pool: State<'_, SqlitePool>,
    changes: Vec<RescheduleChange>,
) -> Result<u32, String> {
    write_reschedule_dates(pool.inner(), changes, true).await
}

// ══════════════════════════════════════════════════════════════
// 复习计划
// ══════════════════════════════════════════════════════════════

#[tauri::command]
pub async fn get_due_review_items(
    pool: State<'_, SqlitePool>,
    today: String,
) -> Result<Vec<ReviewItem>, String> {
    let rows = sqlx::query(
        "SELECT
            ri.id, ri.title, ri.source_event_id, ri.project_id, ri.milestone_id,
            ri.created_at, ri.is_active,
            rs.due_date, rs.last_reviewed_at, rs.stability, rs.difficulty,
            rs.scheduled_days, rs.elapsed_days, rs.reps, rs.lapses,
            p.name AS project_name, m.name AS milestone_name
         FROM review_items ri
         INNER JOIN review_states rs ON rs.item_id = ri.id
         LEFT JOIN projects p ON p.id = ri.project_id
         LEFT JOIN milestones m ON m.id = ri.milestone_id
         WHERE ri.is_active = 1
           AND rs.due_date <= ?
           AND (ri.project_id IS NULL OR p.is_archived = 0)
         ORDER BY rs.due_date ASC, ri.created_at ASC",
    )
    .bind(&today)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(row_to_review_item).collect())
}

#[tauri::command]
pub async fn get_review_items_by_project(
    pool: State<'_, SqlitePool>,
    project_id: String,
) -> Result<Vec<ReviewItem>, String> {
    let rows = sqlx::query(
        "SELECT
            ri.id, ri.title, ri.source_event_id, ri.project_id, ri.milestone_id,
            ri.created_at, ri.is_active,
            rs.due_date, rs.last_reviewed_at, rs.stability, rs.difficulty,
            rs.scheduled_days, rs.elapsed_days, rs.reps, rs.lapses,
            p.name AS project_name, m.name AS milestone_name
         FROM review_items ri
         INNER JOIN review_states rs ON rs.item_id = ri.id
         LEFT JOIN projects p ON p.id = ri.project_id
         LEFT JOIN milestones m ON m.id = ri.milestone_id
         WHERE ri.project_id = ? AND ri.is_active = 1
         ORDER BY rs.due_date ASC, ri.created_at ASC",
    )
    .bind(&project_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(row_to_review_item).collect())
}

#[tauri::command]
pub async fn get_review_stats(
    pool: State<'_, SqlitePool>,
    today: String,
) -> Result<ReviewStats, String> {
    let today_date = parse_ymd(&today).ok_or("today 必须是 YYYY-MM-DD 格式")?;
    let next_7_end = (today_date + Duration::days(6))
        .format("%Y-%m-%d")
        .to_string();
    let last_7_start = (today_date - Duration::days(6))
        .format("%Y-%m-%d")
        .to_string();
    let last_30_start = (today_date - Duration::days(29))
        .format("%Y-%m-%d")
        .to_string();

    let active_filter = "ri.is_active = 1 AND (ri.project_id IS NULL OR p.is_archived = 0)";

    let total_active: i64 = sqlx::query(&format!(
        "SELECT COUNT(*) AS count
         FROM review_items ri
         LEFT JOIN projects p ON p.id = ri.project_id
         WHERE {}",
        active_filter
    ))
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .get("count");

    let due_today: i64 = sqlx::query(&format!(
        "SELECT COUNT(*) AS count
         FROM review_items ri
         INNER JOIN review_states rs ON rs.item_id = ri.id
         LEFT JOIN projects p ON p.id = ri.project_id
         WHERE {} AND rs.due_date = ?",
        active_filter
    ))
    .bind(&today)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .get("count");

    let overdue: i64 = sqlx::query(&format!(
        "SELECT COUNT(*) AS count
         FROM review_items ri
         INNER JOIN review_states rs ON rs.item_id = ri.id
         LEFT JOIN projects p ON p.id = ri.project_id
         WHERE {} AND rs.due_date < ?",
        active_filter
    ))
    .bind(&today)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .get("count");

    let due_next_7_days: i64 = sqlx::query(&format!(
        "SELECT COUNT(*) AS count
         FROM review_items ri
         INNER JOIN review_states rs ON rs.item_id = ri.id
         LEFT JOIN projects p ON p.id = ri.project_id
         WHERE {} AND rs.due_date >= ? AND rs.due_date <= ?",
        active_filter
    ))
    .bind(&today)
    .bind(&next_7_end)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .get("count");

    let reviewed_today: i64 = sqlx::query(
        "SELECT COUNT(*) AS count FROM review_logs WHERE substr(reviewed_at, 1, 10) = ?",
    )
    .bind(&today)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .get("count");

    let reviewed_last_7_days: i64 = sqlx::query(
        "SELECT COUNT(*) AS count
         FROM review_logs
         WHERE substr(reviewed_at, 1, 10) >= ? AND substr(reviewed_at, 1, 10) <= ?",
    )
    .bind(&last_7_start)
    .bind(&today)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .get("count");

    let rating_row = sqlx::query(
        "SELECT
            COALESCE(SUM(CASE WHEN rating = 'again' THEN 1 ELSE 0 END), 0) AS again,
            COALESCE(SUM(CASE WHEN rating = 'hard' THEN 1 ELSE 0 END), 0) AS hard,
            COALESCE(SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END), 0) AS good,
            COALESCE(SUM(CASE WHEN rating = 'easy' THEN 1 ELSE 0 END), 0) AS easy
         FROM review_logs
         WHERE substr(reviewed_at, 1, 10) >= ? AND substr(reviewed_at, 1, 10) <= ?",
    )
    .bind(&last_30_start)
    .bind(&today)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let rating_counts_30_days = ReviewRatingStats {
        again: rating_row.get("again"),
        hard: rating_row.get("hard"),
        good: rating_row.get("good"),
        easy: rating_row.get("easy"),
    };
    let rating_total = rating_counts_30_days.again
        + rating_counts_30_days.hard
        + rating_counts_30_days.good
        + rating_counts_30_days.easy;
    let retention_percent_30_days = if rating_total == 0 {
        0.0
    } else {
        ((rating_counts_30_days.good + rating_counts_30_days.easy) as f64 / rating_total as f64)
            * 100.0
    };

    let load_rows = sqlx::query(&format!(
        "SELECT rs.due_date AS date, COUNT(*) AS due_count
         FROM review_items ri
         INNER JOIN review_states rs ON rs.item_id = ri.id
         LEFT JOIN projects p ON p.id = ri.project_id
         WHERE {} AND rs.due_date >= ? AND rs.due_date <= ?
         GROUP BY rs.due_date
         ORDER BY rs.due_date ASC",
        active_filter
    ))
    .bind(&today)
    .bind(&next_7_end)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let load_by_date: std::collections::HashMap<String, i64> = load_rows
        .iter()
        .map(|row| (row.get::<String, _>("date"), row.get::<i64, _>("due_count")))
        .collect();

    let upcoming_load_7_days = (0..7)
        .map(|offset| {
            let date = (today_date + Duration::days(offset))
                .format("%Y-%m-%d")
                .to_string();
            ReviewDailyLoad {
                due_count: *load_by_date.get(&date).unwrap_or(&0),
                date,
            }
        })
        .collect();

    Ok(ReviewStats {
        total_active,
        due_today,
        overdue,
        due_next_7_days,
        reviewed_today,
        reviewed_last_7_days,
        rating_counts_30_days,
        retention_percent_30_days,
        upcoming_load_7_days,
    })
}

#[tauri::command]
pub async fn get_fsrs_settings(pool: State<'_, SqlitePool>) -> Result<FsrsSettings, String> {
    read_fsrs_settings(pool.inner()).await
}

async fn collect_training_reviews(
    pool: &SqlitePool,
) -> Result<Vec<crate::fsrs::TrainingReview>, String> {
    let rows = sqlx::query(
        "SELECT item_id, reviewed_at, rating
         FROM review_logs
         ORDER BY item_id ASC, reviewed_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut reviews = Vec::new();
    for row in &rows {
        let reviewed_at: String = row.get("reviewed_at");
        let rating: String = row.get("rating");
        if let (Some(reviewed_date), Some(parsed_rating)) = (
            parse_ymd(&reviewed_at),
            crate::fsrs::rating_from_str(&rating),
        ) {
            reviews.push(crate::fsrs::TrainingReview {
                item_id: row.get("item_id"),
                reviewed_date,
                rating: parsed_rating,
            });
        }
    }
    Ok(reviews)
}

async fn rebuild_review_states_from_logs(
    pool: &SqlitePool,
    settings: &FsrsSettings,
) -> Result<(), String> {
    let weights = if settings.weights.len() == 19 {
        let mut parsed = [0.0; 19];
        parsed.copy_from_slice(&settings.weights);
        parsed
    } else {
        crate::fsrs::DEFAULT_FSRS_WEIGHTS
    };
    let reviews = collect_training_reviews(pool).await?;
    let mut grouped: std::collections::BTreeMap<String, Vec<crate::fsrs::TrainingReview>> =
        std::collections::BTreeMap::new();
    for review in reviews {
        grouped
            .entry(review.item_id.clone())
            .or_default()
            .push(review);
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for (item_id, item_reviews) in grouped.iter_mut() {
        item_reviews.sort_by_key(|review| review.reviewed_date);
        let mut memory: Option<crate::fsrs::MemoryState> = None;
        let mut last_reviewed: Option<NaiveDate> = None;
        let mut lapses = 0i64;
        let mut last_elapsed_days = 0i64;
        let mut last_scheduled: Option<crate::fsrs::ScheduledReview> = None;

        for review in item_reviews.iter() {
            let elapsed_days = last_reviewed
                .map(|date| (review.reviewed_date - date).num_days().max(0))
                .unwrap_or(0);
            last_elapsed_days = elapsed_days;
            let scheduled = crate::fsrs::schedule(
                &weights,
                settings.desired_retention,
                settings.maximum_interval,
                memory,
                review.rating,
                elapsed_days,
                lapses,
                review.reviewed_date,
            );
            memory = Some(crate::fsrs::MemoryState {
                stability: scheduled.stability,
                difficulty: scheduled.difficulty,
            });
            lapses = scheduled.lapses;
            last_reviewed = Some(review.reviewed_date);
            last_scheduled = Some(scheduled);
        }

        if let (Some(scheduled), Some(reviewed_date)) = (last_scheduled, last_reviewed) {
            let reps = item_reviews.len() as i64;
            sqlx::query(
                "UPDATE review_states
                 SET due_date=?, last_reviewed_at=?, stability=?, difficulty=?,
                     scheduled_days=?, elapsed_days=?, reps=?, lapses=?
                 WHERE item_id=?",
            )
            .bind(&scheduled.due_date)
            .bind(format!(
                "{}T00:00:00+00:00",
                reviewed_date.format("%Y-%m-%d")
            ))
            .bind(scheduled.stability)
            .bind(scheduled.difficulty)
            .bind(scheduled.scheduled_days)
            .bind(last_elapsed_days)
            .bind(reps)
            .bind(scheduled.lapses)
            .bind(item_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn optimize_fsrs_parameters(
    pool: State<'_, SqlitePool>,
) -> Result<FsrsOptimizeResult, String> {
    let settings = read_fsrs_settings(pool.inner()).await?;
    let reviews = collect_training_reviews(pool.inner()).await?;
    let starting_weights = if settings.weights.len() == 19 {
        let mut parsed = [0.0; 19];
        parsed.copy_from_slice(&settings.weights);
        parsed
    } else {
        crate::fsrs::DEFAULT_FSRS_WEIGHTS
    };

    if reviews.len() < 20 {
        return Ok(FsrsOptimizeResult {
            updated: false,
            message: "复习记录不足，至少需要 20 条复习日志再优化参数。".to_string(),
            reviewed_count: reviews.len() as i64,
            prediction_count: 0,
            previous_loss: None,
            optimized_loss: None,
            settings,
        });
    }

    let Some(result) = crate::fsrs::optimize_weights(
        &reviews,
        starting_weights,
        settings.desired_retention,
        settings.maximum_interval,
    ) else {
        return Ok(FsrsOptimizeResult {
            updated: false,
            message: "可用于训练的连续复习记录不足，先继续积累复习历史。".to_string(),
            reviewed_count: reviews.len() as i64,
            prediction_count: 0,
            previous_loss: None,
            optimized_loss: None,
            settings,
        });
    };

    let improved = result.optimized_loss + 0.0001 < result.previous_loss;
    if !improved {
        return Ok(FsrsOptimizeResult {
            updated: false,
            message: "当前参数已经适合现有记录，暂未覆盖。".to_string(),
            reviewed_count: result.review_count,
            prediction_count: result.prediction_count,
            previous_loss: Some(result.previous_loss),
            optimized_loss: Some(result.optimized_loss),
            settings,
        });
    }

    let optimized_at = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE review_settings
         SET fsrs_weights=?, optimized_at=?, optimizer_review_count=?, optimizer_loss=?
         WHERE id=1",
    )
    .bind(serde_json::to_string(&result.weights).map_err(|e| e.to_string())?)
    .bind(&optimized_at)
    .bind(result.review_count)
    .bind(result.optimized_loss)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let updated_settings = read_fsrs_settings(pool.inner()).await?;
    rebuild_review_states_from_logs(pool.inner(), &updated_settings).await?;

    Ok(FsrsOptimizeResult {
        updated: true,
        message: "FSRS 参数已根据本地复习记录优化，并已重算现有复习项状态。".to_string(),
        reviewed_count: result.review_count,
        prediction_count: result.prediction_count,
        previous_loss: Some(result.previous_loss),
        optimized_loss: Some(result.optimized_loss),
        settings: updated_settings,
    })
}

#[tauri::command]
pub async fn set_event_review_enabled(
    pool: State<'_, SqlitePool>,
    event_id: String,
    enabled: bool,
) -> Result<(), String> {
    if enabled {
        crate::review::ensure_review_items_for_events(pool.inner(), &[event_id]).await
    } else {
        crate::review::deactivate_review_items_for_events(pool.inner(), &[event_id]).await
    }
}

#[tauri::command]
pub async fn review_item(
    pool: State<'_, SqlitePool>,
    item_id: String,
    rating: String,
    reviewed_at: Option<String>,
) -> Result<ReviewItem, String> {
    let row = sqlx::query(
        "SELECT
            ri.id, ri.title, ri.source_event_id, ri.project_id, ri.milestone_id,
            ri.created_at, ri.is_active,
            rs.due_date, rs.last_reviewed_at, rs.stability, rs.difficulty,
            rs.scheduled_days, rs.elapsed_days, rs.reps, rs.lapses,
            p.name AS project_name, m.name AS milestone_name
         FROM review_items ri
         INNER JOIN review_states rs ON rs.item_id = ri.id
         LEFT JOIN projects p ON p.id = ri.project_id
         LEFT JOIN milestones m ON m.id = ri.milestone_id
         WHERE ri.id = ?",
    )
    .bind(&item_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let previous_due_date: String = row.get("due_date");
    let previous_stability: f64 = row.get("stability");
    let previous_difficulty: f64 = row.get("difficulty");
    let previous_reps: i64 = row.get("reps");
    let previous_lapses: i64 = row.get("lapses");
    let last_reviewed_at: Option<String> = row.get("last_reviewed_at");
    let reviewed_at_value = reviewed_at.unwrap_or_else(|| Utc::now().to_rfc3339());
    let reviewed_date = parse_ymd(&reviewed_at_value).unwrap_or_else(|| Utc::now().date_naive());
    let elapsed_days = last_reviewed_at
        .as_deref()
        .and_then(parse_ymd)
        .map(|last| (reviewed_date - last).num_days().max(0))
        .unwrap_or(previous_reps.max(0));

    let settings = read_fsrs_settings(pool.inner()).await?;
    let weights = if settings.weights.len() == 19 {
        let mut parsed = [0.0; 19];
        parsed.copy_from_slice(&settings.weights);
        parsed
    } else {
        crate::fsrs::DEFAULT_FSRS_WEIGHTS
    };
    let parsed_rating = crate::fsrs::rating_from_str(&rating).ok_or("未知复习评分")?;
    let previous_state = if previous_reps == 0 {
        None
    } else {
        Some(crate::fsrs::MemoryState {
            stability: previous_stability,
            difficulty: previous_difficulty,
        })
    };
    let scheduled = crate::fsrs::schedule(
        &weights,
        settings.desired_retention,
        settings.maximum_interval,
        previous_state,
        parsed_rating,
        elapsed_days,
        previous_lapses,
        reviewed_date,
    );

    let log_id = Uuid::new_v4().to_string();
    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO review_logs
         (id, item_id, reviewed_at, rating, previous_due_date, next_due_date,
          previous_stability, next_stability, previous_difficulty, next_difficulty, scheduled_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&log_id)
    .bind(&item_id)
    .bind(&reviewed_at_value)
    .bind(rating.to_lowercase())
    .bind(&previous_due_date)
    .bind(&scheduled.due_date)
    .bind(previous_stability)
    .bind(scheduled.stability)
    .bind(previous_difficulty)
    .bind(scheduled.difficulty)
    .bind(scheduled.scheduled_days)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE review_states
         SET due_date=?, last_reviewed_at=?, stability=?, difficulty=?,
             scheduled_days=?, elapsed_days=?, reps=reps+1, lapses=?
         WHERE item_id=?",
    )
    .bind(&scheduled.due_date)
    .bind(&reviewed_at_value)
    .bind(scheduled.stability)
    .bind(scheduled.difficulty)
    .bind(scheduled.scheduled_days)
    .bind(elapsed_days)
    .bind(scheduled.lapses)
    .bind(&item_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let updated = sqlx::query(
        "SELECT
            ri.id, ri.title, ri.source_event_id, ri.project_id, ri.milestone_id,
            ri.created_at, ri.is_active,
            rs.due_date, rs.last_reviewed_at, rs.stability, rs.difficulty,
            rs.scheduled_days, rs.elapsed_days, rs.reps, rs.lapses,
            p.name AS project_name, m.name AS milestone_name
         FROM review_items ri
         INNER JOIN review_states rs ON rs.item_id = ri.id
         LEFT JOIN projects p ON p.id = ri.project_id
         LEFT JOIN milestones m ON m.id = ri.milestone_id
         WHERE ri.id = ?",
    )
    .bind(&item_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(row_to_review_item(&updated))
}

// ══════════════════════════════════════════════════════════════
// 备份 / 恢复 / Flutter 数据迁移
// ══════════════════════════════════════════════════════════════

/// 导出当前所有数据为 JSON 字符串（Tauri 格式 v8）
#[tauri::command]
pub async fn export_backup(pool: State<'_, SqlitePool>) -> Result<String, String> {
    // 1. 项目
    let project_rows = sqlx::query("SELECT * FROM projects ORDER BY priority")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let projects: Vec<serde_json::Value> = project_rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id":          r.get::<String, _>("id"),
                "name":        r.get::<String, _>("name"),
                "color_value": r.get::<i64, _>("color_value"),
                "priority":    r.get::<i64, _>("priority"),
                "difficulty":  r.get::<String, _>("difficulty"),
                "is_archived": r.get::<i64, _>("is_archived") != 0,
            })
        })
        .collect();

    // 2. 里程碑
    let milestone_rows = sqlx::query("SELECT * FROM milestones ORDER BY project_id, sort_order")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let milestones: Vec<serde_json::Value> = milestone_rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id":          r.get::<String, _>("id"),
                "project_id":  r.get::<String, _>("project_id"),
                "name":        r.get::<String, _>("name"),
                "sort_order":  r.get::<i64, _>("sort_order"),
                "status":      r.get::<String, _>("status"),
                "target_date": r.get::<Option<String>, _>("target_date"),
                "created_at":  r.get::<String, _>("created_at"),
            })
        })
        .collect();

    // 3. 日程
    let event_rows =
        sqlx::query("SELECT * FROM calendar_events ORDER BY project_id, sort_order, created_at")
            .fetch_all(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    let events: Vec<serde_json::Value> = event_rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id":           r.get::<String, _>("id"),
                "title":        r.get::<String, _>("title"),
                "date":         r.get::<Option<String>, _>("date"),
                "due_date":     r.get::<Option<String>, _>("due_date"),
                "created_at":   r.get::<String, _>("created_at"),
                "completed_at": r.get::<Option<String>, _>("completed_at"),
                "is_completed": r.get::<i64, _>("is_completed") != 0,
                "is_pinned":    r.get::<i64, _>("is_pinned") != 0,
                "project_id":   r.get::<Option<String>, _>("project_id"),
                "milestone_id": r.get::<Option<String>, _>("milestone_id"),
                "sort_order":   r.get::<i64, _>("sort_order"),
            })
        })
        .collect();

    // 4. 周模板
    let weekly_rows = sqlx::query("SELECT * FROM weekly_template ORDER BY day_of_week, sort_order")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let mut weekly: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for row in &weekly_rows {
        let day: i64 = row.get("day_of_week");
        let pid: String = row.get("project_id");
        weekly.entry(day.to_string()).or_default().push(pid);
    }

    // 5. 复习计划
    let review_item_rows = sqlx::query("SELECT * FROM review_items ORDER BY created_at")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    let review_items: Vec<serde_json::Value> = review_item_rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id":              r.get::<String, _>("id"),
                "title":           r.get::<String, _>("title"),
                "source_event_id": r.get::<Option<String>, _>("source_event_id"),
                "project_id":      r.get::<Option<String>, _>("project_id"),
                "milestone_id":    r.get::<Option<String>, _>("milestone_id"),
                "created_at":      r.get::<String, _>("created_at"),
                "is_active":       r.get::<i64, _>("is_active") != 0,
            })
        })
        .collect();

    let review_state_rows = sqlx::query("SELECT * FROM review_states ORDER BY due_date")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    let review_states: Vec<serde_json::Value> = review_state_rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "item_id":          r.get::<String, _>("item_id"),
                "due_date":         r.get::<String, _>("due_date"),
                "last_reviewed_at": r.get::<Option<String>, _>("last_reviewed_at"),
                "stability":        r.get::<f64, _>("stability"),
                "difficulty":       r.get::<f64, _>("difficulty"),
                "scheduled_days":   r.get::<i64, _>("scheduled_days"),
                "elapsed_days":     r.get::<i64, _>("elapsed_days"),
                "reps":             r.get::<i64, _>("reps"),
                "lapses":           r.get::<i64, _>("lapses"),
            })
        })
        .collect();

    let review_log_rows = sqlx::query("SELECT * FROM review_logs ORDER BY reviewed_at")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    let review_logs: Vec<serde_json::Value> = review_log_rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id":                  r.get::<String, _>("id"),
                "item_id":             r.get::<String, _>("item_id"),
                "reviewed_at":         r.get::<String, _>("reviewed_at"),
                "rating":              r.get::<String, _>("rating"),
                "previous_due_date":   r.get::<Option<String>, _>("previous_due_date"),
                "next_due_date":       r.get::<String, _>("next_due_date"),
                "previous_stability":  r.get::<Option<f64>, _>("previous_stability"),
                "next_stability":      r.get::<f64, _>("next_stability"),
                "previous_difficulty": r.get::<Option<f64>, _>("previous_difficulty"),
                "next_difficulty":     r.get::<f64, _>("next_difficulty"),
                "scheduled_days":      r.get::<i64, _>("scheduled_days"),
            })
        })
        .collect();

    let review_settings = read_fsrs_settings(pool.inner()).await?;

    let backup = serde_json::json!({
        "version": 8,
        "format": "courseflow_tauri",
        "timestamp": chrono::Local::now().to_rfc3339(),
        "data": {
            "projects": projects,
            "milestones": milestones,
            "events": events,
            "weekly_template": weekly,
            "review_items": review_items,
            "review_states": review_states,
            "review_logs": review_logs,
            "review_settings": review_settings,
        }
    });

    serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())
}

/// 从 Tauri 格式备份恢复（完全覆盖）
#[tauri::command]
pub async fn import_backup(pool: State<'_, SqlitePool>, json: String) -> Result<String, String> {
    let backup: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| format!("JSON 解析失败: {}", e))?;

    let data = backup.get("data").ok_or("缺少 data 字段")?;

    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;

    // 清空
    sqlx::query("DELETE FROM review_logs")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM review_states")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM review_items")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE review_settings
         SET desired_retention=0.9, maximum_interval=36500, fsrs_weights=?,
             optimized_at=NULL, optimizer_review_count=0, optimizer_loss=NULL
         WHERE id=1",
    )
    .bind(crate::fsrs::default_weights_json())
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM weekly_template")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM calendar_events")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM milestones")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM projects")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let mut project_count = 0u32;
    let mut event_count = 0u32;
    let mut review_count = 0u32;

    // 写入项目
    if let Some(projects) = data.get("projects").and_then(|v| v.as_array()) {
        for p in projects {
            sqlx::query("INSERT INTO projects (id, name, color_value, priority, difficulty, is_archived) VALUES (?,?,?,?,?,?)")
                .bind(p["id"].as_str().unwrap_or(""))
                .bind(p["name"].as_str().unwrap_or(""))
                .bind(p["color_value"].as_i64().unwrap_or(0))
                .bind(p["priority"].as_i64().unwrap_or(0))
                .bind(p["difficulty"].as_str().unwrap_or("low"))
                .bind(if p["is_archived"].as_bool().unwrap_or(false) { 1i64 } else { 0i64 })
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
            project_count += 1;
        }
    }

    // 写入里程碑
    if let Some(milestones) = data.get("milestones").and_then(|v| v.as_array()) {
        for m in milestones {
            sqlx::query("INSERT INTO milestones (id, project_id, name, sort_order, status, target_date, created_at) VALUES (?,?,?,?,?,?,?)")
                .bind(m["id"].as_str().unwrap_or(""))
                .bind(m["project_id"].as_str().unwrap_or(""))
                .bind(m["name"].as_str().unwrap_or(""))
                .bind(m["sort_order"].as_i64().unwrap_or(0))
                .bind(m["status"].as_str().unwrap_or("not_started"))
                .bind(m["target_date"].as_str())
                .bind(m["created_at"].as_str().unwrap_or(""))
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    // 写入日程
    if let Some(events) = data.get("events").and_then(|v| v.as_array()) {
        for e in events {
            sqlx::query("INSERT INTO calendar_events (id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
                .bind(e["id"].as_str().unwrap_or(""))
                .bind(e["title"].as_str().unwrap_or(""))
                .bind(e["date"].as_str())
                .bind(e["due_date"].as_str())
                .bind(e["created_at"].as_str().unwrap_or(""))
                .bind(e["completed_at"].as_str())
                .bind(if e["is_completed"].as_bool().unwrap_or(false) { 1i64 } else { 0i64 })
                .bind(if e["is_pinned"].as_bool().unwrap_or(false) { 1i64 } else { 0i64 })
                .bind(e["project_id"].as_str())
                .bind(e["milestone_id"].as_str())
                .bind(e["sort_order"].as_i64().unwrap_or(0))
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
            event_count += 1;
        }
    }

    // 写入周模板
    if let Some(weekly) = data.get("weekly_template").and_then(|v| v.as_object()) {
        for (day, pids) in weekly {
            if let Some(arr) = pids.as_array() {
                for (i, pid) in arr.iter().enumerate() {
                    if let Some(pid_str) = pid.as_str() {
                        sqlx::query("INSERT INTO weekly_template (day_of_week, project_id, sort_order) VALUES (?,?,?)")
                            .bind(day.parse::<i64>().unwrap_or(0))
                            .bind(pid_str)
                            .bind(i as i64)
                            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }

    // 写入复习计划
    if let Some(review_items) = data.get("review_items").and_then(|v| v.as_array()) {
        for item in review_items {
            sqlx::query(
                "INSERT INTO review_items
                 (id, title, source_event_id, project_id, milestone_id, created_at, is_active)
                 VALUES (?,?,?,?,?,?,?)",
            )
            .bind(item["id"].as_str().unwrap_or(""))
            .bind(item["title"].as_str().unwrap_or(""))
            .bind(item["source_event_id"].as_str())
            .bind(item["project_id"].as_str())
            .bind(item["milestone_id"].as_str())
            .bind(item["created_at"].as_str().unwrap_or(""))
            .bind(if item["is_active"].as_bool().unwrap_or(true) {
                1i64
            } else {
                0i64
            })
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            review_count += 1;
        }
    }

    if let Some(review_states) = data.get("review_states").and_then(|v| v.as_array()) {
        for state in review_states {
            sqlx::query(
                "INSERT INTO review_states
                 (item_id, due_date, last_reviewed_at, stability, difficulty,
                  scheduled_days, elapsed_days, reps, lapses)
                 VALUES (?,?,?,?,?,?,?,?,?)",
            )
            .bind(state["item_id"].as_str().unwrap_or(""))
            .bind(state["due_date"].as_str().unwrap_or(""))
            .bind(state["last_reviewed_at"].as_str())
            .bind(state["stability"].as_f64().unwrap_or(1.0))
            .bind(state["difficulty"].as_f64().unwrap_or(5.0))
            .bind(state["scheduled_days"].as_i64().unwrap_or(1))
            .bind(state["elapsed_days"].as_i64().unwrap_or(0))
            .bind(state["reps"].as_i64().unwrap_or(0))
            .bind(state["lapses"].as_i64().unwrap_or(0))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    if let Some(review_logs) = data.get("review_logs").and_then(|v| v.as_array()) {
        for log in review_logs {
            sqlx::query(
                "INSERT INTO review_logs
                 (id, item_id, reviewed_at, rating, previous_due_date, next_due_date,
                  previous_stability, next_stability, previous_difficulty, next_difficulty, scheduled_days)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(log["id"].as_str().unwrap_or(""))
            .bind(log["item_id"].as_str().unwrap_or(""))
            .bind(log["reviewed_at"].as_str().unwrap_or(""))
            .bind(log["rating"].as_str().unwrap_or("good"))
            .bind(log["previous_due_date"].as_str())
            .bind(log["next_due_date"].as_str().unwrap_or(""))
            .bind(log["previous_stability"].as_f64())
            .bind(log["next_stability"].as_f64().unwrap_or(1.0))
            .bind(log["previous_difficulty"].as_f64())
            .bind(log["next_difficulty"].as_f64().unwrap_or(5.0))
            .bind(log["scheduled_days"].as_i64().unwrap_or(1))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    if let Some(settings) = data.get("review_settings") {
        let weights = settings
            .get("weights")
            .and_then(|v| serde_json::to_string(v).ok())
            .unwrap_or_else(crate::fsrs::default_weights_json);
        sqlx::query(
            "UPDATE review_settings
             SET desired_retention=?, maximum_interval=?, fsrs_weights=?,
                 optimized_at=?, optimizer_review_count=?, optimizer_loss=?
             WHERE id=1",
        )
        .bind(settings["desired_retention"].as_f64().unwrap_or(0.9))
        .bind(settings["maximum_interval"].as_i64().unwrap_or(36500))
        .bind(weights)
        .bind(settings["optimized_at"].as_str())
        .bind(settings["optimizer_review_count"].as_i64().unwrap_or(0))
        .bind(settings["optimizer_loss"].as_f64())
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    crate::review::backfill_completed_event_reviews(pool.inner()).await?;
    Ok(format!(
        "已导入 {} 个项目、{} 条日程、{} 个复习项",
        project_count, event_count, review_count
    ))
}

/// 从 Flutter 版备份 JSON 迁移数据（完全覆盖）
///
/// Flutter 备份格式:
///   data.events_data.json:   { "2025-03-01T00:00:00.000": [ { title, createdAt, isCompleted, projectId } ] }
///   data.projects_data.json: [ { id, name, colorValue, priority, difficulty } ]
///   data.weekly_plan.json:   { "1": ["proj_id"], ... }
#[tauri::command]
pub async fn import_flutter_backup(
    pool: State<'_, SqlitePool>,
    json: String,
) -> Result<String, String> {
    let backup: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| format!("JSON 解析失败: {}", e))?;

    let data = backup.get("data").ok_or("缺少 data 字段")?;

    let mut tx = pool.inner().begin().await.map_err(|e| e.to_string())?;

    // 清空
    sqlx::query("DELETE FROM review_logs")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM review_states")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM review_items")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE review_settings
         SET desired_retention=0.9, maximum_interval=36500, fsrs_weights=?,
             optimized_at=NULL, optimizer_review_count=0, optimizer_loss=NULL
         WHERE id=1",
    )
    .bind(crate::fsrs::default_weights_json())
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM weekly_template")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM calendar_events")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM milestones")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM projects")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let mut project_count = 0u32;
    let mut event_count = 0u32;

    // ── 项目：camelCase → snake_case ──
    if let Some(projects) = data.get("projects_data.json").and_then(|v| v.as_array()) {
        for p in projects {
            sqlx::query("INSERT INTO projects (id, name, color_value, priority, difficulty, is_archived) VALUES (?,?,?,?,?,0)")
                .bind(p["id"].as_str().unwrap_or(""))
                .bind(p["name"].as_str().unwrap_or(""))
                .bind(p["colorValue"].as_i64().unwrap_or(0))   // Flutter: colorValue
                .bind(p["priority"].as_i64().unwrap_or(0))
                .bind(p["difficulty"].as_str().unwrap_or("low"))
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
            project_count += 1;
        }
    }

    // ── 日程：DateTime key → date, camelCase → snake_case, 生成 UUID ──
    if let Some(events_map) = data.get("events_data.json").and_then(|v| v.as_object()) {
        for (date_key, event_list) in events_map {
            // "2025-03-01T00:00:00.000" → "2025-03-01"
            let date_str = if date_key.len() >= 10 {
                &date_key[..10]
            } else {
                date_key.as_str()
            };

            if let Some(events) = event_list.as_array() {
                for ev in events {
                    let id = Uuid::new_v4().to_string();
                    sqlx::query("INSERT INTO calendar_events (id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id, sort_order) VALUES (?,?,?,?,?,?,?,?,?,NULL,?)")
                        .bind(&id)
                        .bind(ev["title"].as_str().unwrap_or(""))
                        .bind(date_str)
                        .bind(Option::<String>::None)
                        .bind(ev["createdAt"].as_str().unwrap_or(""))     // Flutter: createdAt
                        .bind(Option::<String>::None)
                        .bind(if ev["isCompleted"].as_bool().unwrap_or(false) { 1i64 } else { 0i64 })
                        .bind(0i64)                                        // Flutter 无此字段，默认未锁定
                        .bind(ev["projectId"].as_str())                    // Flutter: projectId
                        .bind(event_count as i64)
                        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                    event_count += 1;
                }
            }
        }
    }

    // ── 周模板：格式一致，直接写入 ──
    if let Some(weekly) = data.get("weekly_plan.json").and_then(|v| v.as_object()) {
        for (day, pids) in weekly {
            if let Some(arr) = pids.as_array() {
                for (i, pid) in arr.iter().enumerate() {
                    if let Some(pid_str) = pid.as_str() {
                        sqlx::query("INSERT INTO weekly_template (day_of_week, project_id, sort_order) VALUES (?,?,?)")
                            .bind(day.parse::<i64>().unwrap_or(0))
                            .bind(pid_str)
                            .bind(i as i64)
                            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    crate::review::backfill_completed_event_reviews(pool.inner()).await?;
    Ok(format!(
        "已从 Flutter 备份导入 {} 个项目、{} 条日程",
        project_count, event_count
    ))
}

// ── 习惯相关命令 ─────────────────────────────────────────────

#[tauri::command]
pub async fn get_habit_history(
    pool: State<'_, SqlitePool>,
    habit_id: String,
    from_date: String,
    to_date: String,
) -> Result<Vec<String>, String> {
    let rows = sqlx::query(
        "SELECT date FROM habit_completions WHERE habit_id = ? AND date >= ? AND date <= ? ORDER BY date ASC",
    )
    .bind(&habit_id)
    .bind(&from_date)
    .bind(&to_date)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(|r| r.get::<String, _>("date")).collect())
}

/// 计算连续打卡天数（streak）
/// scheduled_days: 该习惯需要打卡的星期集合（1=周一，7=周日）
/// completions: 已打卡的日期集合（"YYYY-MM-DD"）
/// today: 今天的日期
fn calculate_streak(
    scheduled_days: &std::collections::HashSet<u32>,
    completions: &std::collections::HashSet<String>,
    today: chrono::NaiveDate,
) -> i64 {
    use chrono::Datelike;
    let today_dow = today.weekday().number_from_monday();
    let today_str = today.format("%Y-%m-%d").to_string();

    // 若今天是打卡日但还未打卡，从昨天开始计算
    let start = if scheduled_days.contains(&today_dow) && !completions.contains(&today_str) {
        match today.pred_opt() {
            Some(d) => d,
            None => return 0,
        }
    } else {
        today
    };

    let mut streak = 0i64;
    let mut d = start;
    let limit = today - chrono::Duration::days(366);

    loop {
        let dow = d.weekday().number_from_monday();
        if scheduled_days.contains(&dow) {
            let ds = d.format("%Y-%m-%d").to_string();
            if completions.contains(&ds) {
                streak += 1;
            } else {
                break;
            }
        }
        if d <= limit {
            break;
        }
        d = match d.pred_opt() {
            Some(prev) => prev,
            None => break,
        };
    }

    streak
}

#[tauri::command]
pub async fn get_habits(
    pool: State<'_, SqlitePool>,
    date: String,
) -> Result<Vec<HabitWithStats>, String> {
    use chrono::NaiveDate;
    use std::collections::{HashMap, HashSet};

    let today = NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(|e| e.to_string())?;
    let today_dow = today.weekday().number_from_monday();
    let history_start = (today - chrono::Duration::days(366))
        .format("%Y-%m-%d")
        .to_string();

    let habit_rows = sqlx::query(
        "SELECT id, name, color_value, days_of_week, created_at, is_active FROM habits WHERE is_active = 1 ORDER BY created_at ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let completion_rows = sqlx::query(
        "SELECT hc.habit_id, hc.date
         FROM habit_completions hc
         JOIN habits h ON h.id = hc.habit_id
         WHERE h.is_active = 1
           AND hc.date >= ?
           AND hc.date <= ?",
    )
    .bind(&history_start)
    .bind(&date)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let mut completion_map: HashMap<String, HashSet<String>> = HashMap::new();
    for row in completion_rows {
        let habit_id: String = row.get("habit_id");
        let d: String = row.get("date");
        completion_map.entry(habit_id).or_default().insert(d);
    }
    let empty_completions: HashSet<String> = HashSet::new();

    let result = habit_rows
        .iter()
        .map(|r| {
            let id: String = r.get("id");
            let days_of_week: String = r.get("days_of_week");
            let scheduled_days: HashSet<u32> = days_of_week
                .split(',')
                .filter_map(|s| s.trim().parse::<u32>().ok())
                .collect();
            let completions = completion_map.get(&id).unwrap_or(&empty_completions);
            let completed_today = completions.contains(&date);
            let scheduled_today = scheduled_days.contains(&today_dow);
            let streak = calculate_streak(&scheduled_days, completions, today);

            HabitWithStats {
                id,
                name: r.get("name"),
                color_value: r.get("color_value"),
                days_of_week,
                created_at: r.get("created_at"),
                is_active: r.get::<i64, _>("is_active") != 0,
                scheduled_today,
                completed_today,
                streak,
            }
        })
        .collect();

    Ok(result)
}

#[tauri::command]
pub async fn add_habit(
    pool: State<'_, SqlitePool>,
    name: String,
    days_of_week: String,
    color_value: i64,
) -> Result<HabitWithStats, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO habits (id, name, color_value, days_of_week, created_at, is_active) VALUES (?,?,?,?,?,1)",
    )
    .bind(&id)
    .bind(&name)
    .bind(color_value)
    .bind(&days_of_week)
    .bind(&now)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(HabitWithStats {
        id,
        name,
        color_value,
        days_of_week,
        created_at: now,
        is_active: true,
        scheduled_today: false, // 前端重新 load 后会更新
        completed_today: false,
        streak: 0,
    })
}

#[tauri::command]
pub async fn update_habit(
    pool: State<'_, SqlitePool>,
    id: String,
    name: String,
    days_of_week: String,
) -> Result<(), String> {
    sqlx::query("UPDATE habits SET name = ?, days_of_week = ? WHERE id = ?")
        .bind(&name)
        .bind(&days_of_week)
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_habit(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM habits WHERE id = ?")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 切换某一天的打卡状态。返回打卡后的状态（true = 已打卡，false = 已撤销）
#[tauri::command]
pub async fn toggle_habit_completion(
    pool: State<'_, SqlitePool>,
    habit_id: String,
    date: String,
) -> Result<bool, String> {
    let existing = sqlx::query("SELECT id FROM habit_completions WHERE habit_id = ? AND date = ?")
        .bind(&habit_id)
        .bind(&date)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    if existing.is_some() {
        // 已打卡 → 撤销
        sqlx::query("DELETE FROM habit_completions WHERE habit_id = ? AND date = ?")
            .bind(&habit_id)
            .bind(&date)
            .execute(pool.inner())
            .await
            .map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        // 未打卡 → 打卡
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO habit_completions (id, habit_id, date, created_at) VALUES (?,?,?,?)",
        )
        .bind(&id)
        .bind(&habit_id)
        .bind(&date)
        .bind(&now)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
        Ok(true)
    }
}
