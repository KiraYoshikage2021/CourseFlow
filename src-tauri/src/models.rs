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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RescheduleChange {
    pub id: String,
    pub title: String,
    pub project_id: String,
    pub old_date: Option<String>,
    pub new_date: Option<String>,
}
