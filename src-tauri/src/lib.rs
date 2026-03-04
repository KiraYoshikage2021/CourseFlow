use tauri::Manager;
mod commands;
mod db;
mod models;
use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let pool = tauri::async_runtime::block_on(db::init_db());
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_projects,
            add_project,
            update_project,
            delete_project,
            reorder_projects,
            get_events_by_date,
            get_events_by_month,
            get_unscheduled_events,
            add_event,
            update_event,
            delete_event,
            add_events_batch,
            batch_delete_events,
            batch_complete_events,
            toggle_event_complete,
            delete_events_by_project,
            get_weekly_template,
            save_weekly_template,
            reschedule_events,
            get_project_stats,
            export_backup,
            import_backup,
            import_flutter_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
