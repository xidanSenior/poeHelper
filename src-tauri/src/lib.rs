mod log_watcher;

use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// Запоминаем только положение: размер окна фиксированный, видимость решает пользователь.
const SAVED_STATE: StateFlags = StateFlags::POSITION;
const DEFAULT_POSITION: (i32, i32) = (40, 140);

#[derive(Default)]
struct AppState {
    watcher: Mutex<Option<log_watcher::WatchHandle>>,
    /// true — окно ловит мышь (настройка), false — клики проходят сквозь него в игру.
    interactive: Mutex<bool>,
}

#[tauri::command]
fn detect_log_path() -> Option<String> {
    log_watcher::detect_default_path()
}

#[tauri::command]
fn start_watch(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    let mut guard = state.watcher.lock().unwrap();
    if let Some(old) = guard.take() {
        old.stop();
    }
    *guard = Some(log_watcher::start(app, path.into())?);
    Ok(())
}

fn set_interactive(app: &AppHandle, value: bool) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("main window not found")?;
    win.set_ignore_cursor_events(!value).map_err(|e| e.to_string())?;
    if value {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        // Выход из настройки — окно могли перетащить, сохраняем позицию сразу.
        let _ = app.save_window_state(SAVED_STATE);
    }
    *app.state::<AppState>().interactive.lock().unwrap() = value;
    app.emit("interactive-changed", value).map_err(|e| e.to_string())
}

fn toggle_interactive(app: &AppHandle) {
    let next = !*app.state::<AppState>().interactive.lock().unwrap();
    let _ = set_interactive(app, next);
}

fn toggle_visibility(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(true) {
            let _ = win.hide();
        } else {
            let _ = win.show();
        }
    }
}

fn reset_position(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_position(PhysicalPosition::new(DEFAULT_POSITION.0, DEFAULT_POSITION.1));
        let _ = win.show();
        let _ = app.save_window_state(SAVED_STATE);
    }
}

fn quit(app: &AppHandle) {
    let _ = app.save_window_state(SAVED_STATE);
    app.exit(0);
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Показать / скрыть  (Alt+Shift+H)", true, None::<&str>)?;
    let edit = MenuItem::with_id(app, "edit", "Режим настройки  (Alt+Shift+O)", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "reset", "Вернуть окно на место", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let exit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &edit, &reset, &separator, &exit])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("PoE Overlay")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => toggle_visibility(app),
            "edit" => toggle_interactive(app),
            "reset" => reset_position(app),
            "quit" => quit(app),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub fn run() {
    let toggle_edit = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyO);
    let toggle_hide = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyH);
    let step_next = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::ArrowRight);
    let step_prev = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::ArrowLeft);

    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(SAVED_STATE)
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &toggle_edit {
                        toggle_interactive(app);
                    } else if shortcut == &toggle_hide {
                        toggle_visibility(app);
                    } else if shortcut == &step_next {
                        let _ = app.emit("guide-nav", 1);
                    } else if shortcut == &step_prev {
                        let _ = app.emit("guide-nav", -1);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            app.global_shortcut().register(toggle_edit)?;
            app.global_shortcut().register(toggle_hide)?;
            app.global_shortcut().register(step_next)?;
            app.global_shortcut().register(step_prev)?;
            build_tray(app)?;
            // По умолчанию оверлей прозрачен для мыши и не мешает играть.
            if let Some(win) = app.get_webview_window("main") {
                win.set_ignore_cursor_events(true)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![detect_log_path, start_watch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
