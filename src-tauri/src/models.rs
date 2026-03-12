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
    pub date: Option<String>, // None = 待分配（未绑定日期）
    pub created_at: String,
    pub is_completed: bool,
    pub is_pinned: bool,
    pub project_id: Option<String>,
}
