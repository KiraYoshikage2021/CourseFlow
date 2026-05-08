use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub color_value: i64,
    pub priority: i64,
    pub difficulty: Difficulty,
    pub is_archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MilestoneWithStats {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub sort_order: i64,
    pub status: String,
    pub target_date: Option<String>,
    pub created_at: String,
    pub total: i64,
    pub done: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HabitWithStats {
    pub id: String,
    pub name: String,
    pub color_value: i64,
    pub days_of_week: String,
    pub created_at: String,
    pub is_active: bool,
    pub scheduled_today: bool,
    pub completed_today: bool,
    pub streak: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub date: Option<String>,     // scheduled date; None = 待分配
    pub due_date: Option<String>, // deadline / target completion date
    pub created_at: String,
    pub completed_at: Option<String>,
    pub is_completed: bool,
    pub is_pinned: bool,
    pub project_id: Option<String>,
    pub milestone_id: Option<String>,
    #[serde(default)]
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RescheduleChange {
    pub id: String,
    pub title: String,
    pub project_id: String,
    pub old_date: Option<String>,
    pub new_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewItem {
    pub id: String,
    pub title: String,
    pub source_event_id: Option<String>,
    pub project_id: Option<String>,
    pub milestone_id: Option<String>,
    pub created_at: String,
    pub is_active: bool,
    pub due_date: String,
    pub last_reviewed_at: Option<String>,
    pub stability: f64,
    pub difficulty: f64,
    pub scheduled_days: i64,
    pub elapsed_days: i64,
    pub reps: i64,
    pub lapses: i64,
    pub project_name: Option<String>,
    pub milestone_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewRatingStats {
    pub again: i64,
    pub hard: i64,
    pub good: i64,
    pub easy: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewDailyLoad {
    pub date: String,
    pub due_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewStats {
    pub total_active: i64,
    pub due_today: i64,
    pub overdue: i64,
    pub due_next_7_days: i64,
    pub reviewed_today: i64,
    pub reviewed_last_7_days: i64,
    pub rating_counts_30_days: ReviewRatingStats,
    pub retention_percent_30_days: f64,
    pub upcoming_load_7_days: Vec<ReviewDailyLoad>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsrsSettings {
    pub desired_retention: f64,
    pub maximum_interval: i64,
    pub weights: Vec<f64>,
    pub optimized_at: Option<String>,
    pub optimizer_review_count: i64,
    pub optimizer_loss: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsrsOptimizeResult {
    pub updated: bool,
    pub message: String,
    pub reviewed_count: i64,
    pub prediction_count: i64,
    pub previous_loss: Option<f64>,
    pub optimized_loss: Option<f64>,
    pub settings: FsrsSettings,
}
