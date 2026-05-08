use chrono::{Duration, NaiveDate, Utc};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

fn parse_date_prefix(value: Option<&str>) -> Option<NaiveDate> {
    value
        .and_then(|v| v.get(0..10))
        .and_then(|v| NaiveDate::parse_from_str(v, "%Y-%m-%d").ok())
}

fn initial_due_date(
    completed_at: Option<&str>,
    due_date: Option<&str>,
    date: Option<&str>,
    created_at: Option<&str>,
) -> String {
    let base = parse_date_prefix(completed_at)
        .or_else(|| parse_date_prefix(due_date))
        .or_else(|| parse_date_prefix(date))
        .or_else(|| parse_date_prefix(created_at))
        .unwrap_or_else(|| Utc::now().date_naive());

    (base + Duration::days(1)).format("%Y-%m-%d").to_string()
}

pub async fn ensure_review_items_for_events(
    pool: &SqlitePool,
    ids: &[String],
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }

    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT
            e.id,
            e.title,
            e.date,
            e.due_date,
            e.created_at,
            e.completed_at,
            e.project_id,
            e.milestone_id,
            ri.id AS review_item_id
         FROM calendar_events e
         LEFT JOIN review_items ri ON ri.source_event_id = e.id
         WHERE e.is_completed = 1 AND e.id IN ({})",
        placeholders
    );

    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    let rows = query.fetch_all(pool).await.map_err(|e| e.to_string())?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for row in &rows {
        let event_id: String = row.get("id");
        let title: String = row.get("title");
        let date: Option<String> = row.get("date");
        let due_date: Option<String> = row.get("due_date");
        let created_at: String = row.get("created_at");
        let completed_at: Option<String> = row.get("completed_at");
        let project_id: Option<String> = row.get("project_id");
        let milestone_id: Option<String> = row.get("milestone_id");
        let review_item_id: Option<String> = row.get("review_item_id");
        let initial_due = initial_due_date(
            completed_at.as_deref(),
            due_date.as_deref(),
            date.as_deref(),
            Some(&created_at),
        );

        if let Some(item_id) = review_item_id {
            sqlx::query(
                "UPDATE review_items
                 SET title=?, project_id=?, milestone_id=?, is_active=1
                 WHERE id=?",
            )
            .bind(&title)
            .bind(&project_id)
            .bind(&milestone_id)
            .bind(&item_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            sqlx::query(
                "INSERT OR IGNORE INTO review_states
                 (item_id, due_date, last_reviewed_at, stability, difficulty, scheduled_days, elapsed_days, reps, lapses)
                 VALUES (?, ?, NULL, 1.0, 5.0, 1, 0, 0, 0)",
            )
            .bind(&item_id)
            .bind(&initial_due)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        } else {
            let item_id = Uuid::new_v4().to_string();
            let now = Utc::now().to_rfc3339();
            sqlx::query(
                "INSERT INTO review_items
                 (id, title, source_event_id, project_id, milestone_id, created_at, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, 1)",
            )
            .bind(&item_id)
            .bind(&title)
            .bind(&event_id)
            .bind(&project_id)
            .bind(&milestone_id)
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            sqlx::query(
                "INSERT INTO review_states
                 (item_id, due_date, last_reviewed_at, stability, difficulty, scheduled_days, elapsed_days, reps, lapses)
                 VALUES (?, ?, NULL, 1.0, 5.0, 1, 0, 0, 0)",
            )
            .bind(&item_id)
            .bind(&initial_due)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())
}

pub async fn deactivate_review_items_for_events(
    pool: &SqlitePool,
    ids: &[String],
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }

    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "UPDATE review_items SET is_active=0 WHERE source_event_id IN ({})",
        placeholders
    );
    let mut query = sqlx::query(&sql);
    for id in ids {
        query = query.bind(id);
    }
    query
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub async fn delete_review_items_for_events(
    pool: &SqlitePool,
    ids: &[String],
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }

    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let select_sql = format!(
        "SELECT id FROM review_items WHERE source_event_id IN ({})",
        placeholders
    );
    let mut select_query = sqlx::query(&select_sql);
    for id in ids {
        select_query = select_query.bind(id);
    }
    let rows = select_query
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let item_ids = rows
        .iter()
        .map(|row| row.get::<String, _>("id"))
        .collect::<Vec<_>>();

    if item_ids.is_empty() {
        return Ok(());
    }

    let item_placeholders = item_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let logs_sql = format!(
        "DELETE FROM review_logs WHERE item_id IN ({})",
        item_placeholders
    );
    let mut logs_query = sqlx::query(&logs_sql);
    for id in &item_ids {
        logs_query = logs_query.bind(id);
    }
    logs_query
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let states_sql = format!(
        "DELETE FROM review_states WHERE item_id IN ({})",
        item_placeholders
    );
    let mut states_query = sqlx::query(&states_sql);
    for id in &item_ids {
        states_query = states_query.bind(id);
    }
    states_query
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let items_sql = format!(
        "DELETE FROM review_items WHERE id IN ({})",
        item_placeholders
    );
    let mut items_query = sqlx::query(&items_sql);
    for id in &item_ids {
        items_query = items_query.bind(id);
    }
    items_query
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())
}

pub async fn backfill_completed_event_reviews(pool: &SqlitePool) -> Result<(), String> {
    let rows = sqlx::query(
        "SELECT e.id
         FROM calendar_events e
         LEFT JOIN review_items ri ON ri.source_event_id = e.id
         WHERE e.is_completed = 1 AND ri.id IS NULL",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let ids = rows
        .iter()
        .map(|row| row.get::<String, _>("id"))
        .collect::<Vec<_>>();

    ensure_review_items_for_events(pool, &ids).await
}
