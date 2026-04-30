use sqlx::{sqlite::SqliteConnectOptions, Row, SqlitePool};
use std::str::FromStr;

/// 迁移：确保 calendar_events.date 列允许 NULL
/// SQLite 不支持 ALTER COLUMN，需要重建表
async fn migrate_calendar_events_date_nullable(pool: &SqlitePool) {
    // 用 PRAGMA table_info 检查 date 列是否有 NOT NULL 约束
    let rows = sqlx::query("PRAGMA table_info(calendar_events)")
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    let needs_migration = rows.iter().any(|row| {
        let name: String = row.get("name");
        let notnull: i64 = row.get("notnull");
        name == "date" && notnull == 1
    });

    if !needs_migration {
        return;
    }

    println!("[迁移] calendar_events.date 列有 NOT NULL 约束，正在重建表以允许 NULL...");

    // SQLite 重建表的标准流程：
    // 1. 创建新表 → 2. 复制数据 → 3. 删除旧表 → 4. 重命名新表
    let mut tx = pool.begin().await.expect("迁移事务启动失败");

    sqlx::query(
        "CREATE TABLE calendar_events_new (
            id           TEXT PRIMARY KEY,
            title        TEXT NOT NULL,
            date         TEXT,
            created_at   TEXT NOT NULL,
            is_completed INTEGER NOT NULL DEFAULT 0,
            project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL
        )",
    )
    .execute(&mut *tx)
    .await
    .expect("迁移：创建新表失败");

    sqlx::query(
        "INSERT INTO calendar_events_new (id, title, date, created_at, is_completed, project_id)
         SELECT id, title, date, created_at, is_completed, project_id
         FROM calendar_events",
    )
    .execute(&mut *tx)
    .await
    .expect("迁移：复制数据失败");

    sqlx::query("DROP TABLE calendar_events")
        .execute(&mut *tx)
        .await
        .expect("迁移：删除旧表失败");

    sqlx::query("ALTER TABLE calendar_events_new RENAME TO calendar_events")
        .execute(&mut *tx)
        .await
        .expect("迁移：重命名新表失败");

    tx.commit().await.expect("迁移事务提交失败");

    println!("[迁移] calendar_events 表重建完成，date 列现在允许 NULL");
}

/// 迁移：为已有数据库添加 is_pinned 列（SQLite 支持 ADD COLUMN）
async fn migrate_add_is_pinned(pool: &SqlitePool) {
    let rows = sqlx::query("PRAGMA table_info(calendar_events)")
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    let has_column = rows.iter().any(|row| {
        let name: String = row.get("name");
        name == "is_pinned"
    });

    if has_column {
        return;
    }

    println!("[迁移] calendar_events 缺少 is_pinned 列，正在添加…");
    sqlx::query("ALTER TABLE calendar_events ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0")
        .execute(pool)
        .await
        .expect("迁移：添加 is_pinned 列失败");
    println!("[迁移] is_pinned 列添加完成");
}

/// 迁移：为已有项目添加归档状态
async fn migrate_add_project_archive(pool: &SqlitePool) {
    let rows = sqlx::query("PRAGMA table_info(projects)")
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    let has_column = rows.iter().any(|row| {
        let name: String = row.get("name");
        name == "is_archived"
    });

    if has_column {
        return;
    }

    println!("[迁移] projects 缺少 is_archived 列，正在添加…");
    sqlx::query("ALTER TABLE projects ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0")
        .execute(pool)
        .await
        .expect("迁移：添加 is_archived 列失败");
    println!("[迁移] is_archived 列添加完成");
}

/// 迁移：为事件添加所属里程碑
async fn migrate_add_event_milestone(pool: &SqlitePool) {
    let rows = sqlx::query("PRAGMA table_info(calendar_events)")
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    let has_column = rows.iter().any(|row| {
        let name: String = row.get("name");
        name == "milestone_id"
    });

    if has_column {
        return;
    }

    println!("[迁移] calendar_events 缺少 milestone_id 列，正在添加…");
    sqlx::query(
        "ALTER TABLE calendar_events ADD COLUMN milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL",
    )
    .execute(pool)
    .await
    .expect("迁移：添加 milestone_id 列失败");
    println!("[迁移] milestone_id 列添加完成");
}

/// 迁移：为事件添加截止日期
async fn migrate_add_event_due_date(pool: &SqlitePool) {
    let rows = sqlx::query("PRAGMA table_info(calendar_events)")
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    let has_column = rows.iter().any(|row| {
        let name: String = row.get("name");
        name == "due_date"
    });

    if has_column {
        return;
    }

    println!("[迁移] calendar_events 缺少 due_date 列，正在添加…");
    sqlx::query("ALTER TABLE calendar_events ADD COLUMN due_date TEXT")
        .execute(pool)
        .await
        .expect("迁移：添加 due_date 列失败");
    println!("[迁移] due_date 列添加完成");
}

/// 迁移：为事件添加完成时间
async fn migrate_add_event_completed_at(pool: &SqlitePool) {
    let rows = sqlx::query("PRAGMA table_info(calendar_events)")
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    let has_column = rows.iter().any(|row| {
        let name: String = row.get("name");
        name == "completed_at"
    });

    if has_column {
        return;
    }

    println!("[迁移] calendar_events 缺少 completed_at 列，正在添加…");
    sqlx::query("ALTER TABLE calendar_events ADD COLUMN completed_at TEXT")
        .execute(pool)
        .await
        .expect("迁移：添加 completed_at 列失败");
    println!("[迁移] completed_at 列添加完成");
}

pub async fn init_db(db_path: &str) -> SqlitePool {
    let db_url = format!("sqlite:{}", db_path);

    let options = SqliteConnectOptions::from_str(&db_url)
        .unwrap()
        .create_if_missing(true);

    let pool = SqlitePool::connect_with(options)
        .await
        .expect("数据库连接失败");

    // 自动建表
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS projects (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            color_value INTEGER NOT NULL,
            priority    INTEGER NOT NULL DEFAULT 3,
            difficulty  TEXT NOT NULL DEFAULT 'low',
            is_archived INTEGER NOT NULL DEFAULT 0
        )",
    )
    .execute(&pool)
    .await
    .unwrap();

    migrate_add_project_archive(&pool).await;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS milestones (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            status      TEXT NOT NULL DEFAULT 'not_started',
            target_date TEXT,
            created_at  TEXT NOT NULL
        )",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS calendar_events (
            id           TEXT PRIMARY KEY,
            title        TEXT NOT NULL,
            date         TEXT,
            due_date     TEXT,
            created_at   TEXT NOT NULL,
            completed_at TEXT,
            is_completed INTEGER NOT NULL DEFAULT 0,
            is_pinned    INTEGER NOT NULL DEFAULT 0,
            project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
            milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL
        )",
    )
    .execute(&pool)
    .await
    .unwrap();

    // 迁移：如果 date 列有 NOT NULL 约束（旧版 schema），则重建表以允许 NULL
    migrate_calendar_events_date_nullable(&pool).await;

    // 迁移：为旧数据库添加 is_pinned 列
    migrate_add_is_pinned(&pool).await;

    // 迁移：为旧数据库添加 milestone_id 列
    migrate_add_event_milestone(&pool).await;

    // 迁移：为旧数据库添加 due_date 列
    migrate_add_event_due_date(&pool).await;

    // 迁移：为旧数据库添加 completed_at 列
    migrate_add_event_completed_at(&pool).await;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_events_date ON calendar_events(date)")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_events_due_date ON calendar_events(due_date)")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_events_project_id ON calendar_events(project_id)")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_events_milestone_id ON calendar_events(milestone_id)",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id)")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS habits (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            color_value INTEGER NOT NULL,
            days_of_week TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            is_active   INTEGER NOT NULL DEFAULT 1
        )",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS habit_completions (
            id          TEXT PRIMARY KEY,
            habit_id    TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
            date        TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            UNIQUE(habit_id, date)
        )",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_habit_completions_date ON habit_completions(date)")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS weekly_template (
            day_of_week INTEGER NOT NULL,
            project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (day_of_week, project_id)
        )",
    )
    .execute(&pool)
    .await
    .unwrap();

    pool
}
