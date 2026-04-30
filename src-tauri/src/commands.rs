use crate::models::*;
use chrono::Datelike;
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};
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
    }
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
    sqlx::query("UPDATE calendar_events SET milestone_id=NULL WHERE project_id=?")
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
    let rows = sqlx::query("SELECT id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id FROM calendar_events WHERE date=? ORDER BY created_at")
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
    let rows = sqlx::query("SELECT id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id FROM calendar_events WHERE date LIKE ? ORDER BY date, created_at")
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
        "SELECT id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id FROM calendar_events WHERE date IS NULL ORDER BY created_at",
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
        "SELECT id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id
         FROM calendar_events
         WHERE project_id=?
         ORDER BY date IS NULL, date, created_at",
    )
    .bind(&project_id)
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
        "SELECT e.id, e.title, e.date, e.due_date, e.created_at, e.completed_at, e.is_completed, e.is_pinned, e.project_id, e.milestone_id
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

    sqlx::query(
        "INSERT INTO calendar_events (id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id) VALUES (?, ?, ?, ?, ?, NULL, 0, 0, ?, NULL)",
    )
    .bind(&id)
    .bind(&title)
    .bind(&date)
    .bind(&due_date)
    .bind(&created_at)
    .bind(&project_id)
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
    sqlx::query("UPDATE calendar_events SET title=?, project_id=?, due_date=? WHERE id=?")
        .bind(&title)
        .bind(&project_id)
        .bind(&due_date)
        .bind(&id)
        .execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
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
    sqlx::query("UPDATE calendar_events SET milestone_id=? WHERE id=?")
        .bind(&milestone_id)
        .bind(&id)
        .execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
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
    let mut q = sqlx::query(&sql).bind(&milestone_id);
    for id in &ids {
        q = q.bind(id);
    }
    q.execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_event(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
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
    for event in &events {
        let is_completed = event.is_completed as i64;
        let is_pinned = event.is_pinned as i64;
        sqlx::query("INSERT INTO calendar_events (id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(&event.id).bind(&event.title).bind(&event.date).bind(&event.due_date)
            .bind(&event.created_at).bind(&event.completed_at).bind(is_completed).bind(is_pinned).bind(&event.project_id).bind(&event.milestone_id)
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
pub async fn toggle_event_complete(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    let completed_at = chrono::Utc::now().to_rfc3339();
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
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_events_by_project(
    pool: State<'_, SqlitePool>,
    project_id: String,
) -> Result<(), String> {
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
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let completed_at = chrono::Utc::now().to_rfc3339();
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "UPDATE calendar_events SET is_completed=1, completed_at=COALESCE(completed_at, ?) WHERE id IN ({})",
        placeholders
    );
    let mut q = sqlx::query(&sql).bind(completed_at);
    for id in &ids {
        q = q.bind(id);
    }
    q.execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
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
    q.execute(pool.inner())
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
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
         ORDER BY created_at ASC",
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
         ORDER BY created_at ASC",
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
// 备份 / 恢复 / Flutter 数据迁移
// ══════════════════════════════════════════════════════════════

/// 导出当前所有数据为 JSON 字符串（Tauri 格式 v5）
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
    let event_rows = sqlx::query("SELECT * FROM calendar_events ORDER BY created_at")
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

    let backup = serde_json::json!({
        "version": 5,
        "format": "courseflow_tauri",
        "timestamp": chrono::Local::now().to_rfc3339(),
        "data": {
            "projects": projects,
            "milestones": milestones,
            "events": events,
            "weekly_template": weekly,
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
            sqlx::query("INSERT INTO calendar_events (id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id) VALUES (?,?,?,?,?,?,?,?,?,?)")
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

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(format!(
        "已导入 {} 个项目、{} 条日程",
        project_count, event_count
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
                    sqlx::query("INSERT INTO calendar_events (id, title, date, due_date, created_at, completed_at, is_completed, is_pinned, project_id, milestone_id) VALUES (?,?,?,?,?,?,?,?,?,NULL)")
                        .bind(&id)
                        .bind(ev["title"].as_str().unwrap_or(""))
                        .bind(date_str)
                        .bind(Option::<String>::None)
                        .bind(ev["createdAt"].as_str().unwrap_or(""))     // Flutter: createdAt
                        .bind(Option::<String>::None)
                        .bind(if ev["isCompleted"].as_bool().unwrap_or(false) { 1i64 } else { 0i64 })
                        .bind(0i64)                                        // Flutter 无此字段，默认未锁定
                        .bind(ev["projectId"].as_str())                    // Flutter: projectId
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
