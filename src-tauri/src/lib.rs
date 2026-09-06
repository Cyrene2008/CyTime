#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::Command;
use std::time::Duration;
use std::thread;
use std::sync::{Arc, Mutex};
use serde_json::Value;
use tauri::{include_image, AppHandle, Emitter, LogicalSize, Manager, Size, WindowEvent};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri_plugin_deep_link::DeepLinkExt;

struct PendingUris(Arc<Mutex<Vec<String>>>);

#[tauri::command]
fn application_platform() -> &'static str {
    "tauri"
}

#[tauri::command]
fn desktop_startup_args() -> Vec<String> {
    std::env::args().skip(1).collect()
}

#[tauri::command]
fn desktop_pending_uris(state: tauri::State<'_, PendingUris>) -> Vec<String> {
    state.0.lock().map(|mut pending| std::mem::take(&mut *pending)).unwrap_or_default()
}

#[tauri::command]
fn desktop_set_uri_registration(app: AppHandle, enabled: bool) -> Result<bool, String> {
    if enabled { app.deep_link().register("cytime").map_err(|error| error.to_string())?; }
    else { app.deep_link().unregister("cytime").map_err(|error| error.to_string())?; }
    Ok(enabled)
}

#[tauri::command]
fn desktop_window_mode(app: AppHandle, mode: String) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or_else(|| "main window unavailable".to_string())?;
    match mode.as_str() {
        "mini" => {
            window.set_resizable(false).map_err(|error| error.to_string())?;
            window.set_min_size(Some(Size::Logical(LogicalSize::new(640.0, 480.0)))).map_err(|error| error.to_string())?;
            window.set_max_size(Some(Size::Logical(LogicalSize::new(640.0, 480.0)))).map_err(|error| error.to_string())?;
            window.set_fullscreen(false).map_err(|error| error.to_string())?;
            window.unmaximize().map_err(|error| error.to_string())?;
            window.set_size(Size::Logical(LogicalSize::new(640.0, 480.0))).map_err(|error| error.to_string())?;
        }
        "normal" => {
            window.set_resizable(true).map_err(|error| error.to_string())?;
            window.set_min_size(Some(Size::Logical(LogicalSize::new(1280.0, 720.0)))).map_err(|error| error.to_string())?;
            window.set_max_size(None::<Size>).map_err(|error| error.to_string())?;
            window.set_fullscreen(false).map_err(|error| error.to_string())?;
            window.unmaximize().map_err(|error| error.to_string())?;
            window.set_size(Size::Logical(LogicalSize::new(1280.0, 720.0))).map_err(|error| error.to_string())?;
        }
        "max" => {
            window.set_resizable(true).map_err(|error| error.to_string())?;
            window.set_min_size(Some(Size::Logical(LogicalSize::new(1280.0, 720.0)))).map_err(|error| error.to_string())?;
            window.set_max_size(None::<Size>).map_err(|error| error.to_string())?;
            window.set_fullscreen(false).map_err(|error| error.to_string())?;
            window.maximize().map_err(|error| error.to_string())?;
        }
        "full" => {
            window.set_resizable(true).map_err(|error| error.to_string())?;
            window.set_min_size(Some(Size::Logical(LogicalSize::new(1280.0, 720.0)))).map_err(|error| error.to_string())?;
            window.set_max_size(None::<Size>).map_err(|error| error.to_string())?;
            window.set_fullscreen(true).map_err(|error| error.to_string())?;
        }
        _ => return Err("unknown window mode".to_string())
    }
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[cfg(windows)]
fn scheduled_task_command(executable: &std::path::Path) -> String {
    format!("\"{}\" --cyrene-auto-start", executable.display())
}

#[cfg(windows)]
fn run_scheduled_task(arguments: &[&str], elevated: bool) -> Result<bool, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    if elevated {
        let argument_list = arguments.iter().map(|argument| format!("'{}'", argument.replace('`', "``").replace('\'', "''"))).collect::<Vec<_>>().join(",");
        let script = format!("$p=Start-Process -FilePath 'schtasks.exe' -ArgumentList @({argument_list}) -Verb RunAs -Wait -PassThru; exit $p.ExitCode");
        return Ok(Command::new("powershell").creation_flags(CREATE_NO_WINDOW).args(["-NoProfile", "-NonInteractive", "-Command", &script]).status().map_err(|error| error.to_string())?.success());
    }
    Ok(Command::new("schtasks").creation_flags(CREATE_NO_WINDOW).args(arguments).status().map_err(|error| error.to_string())?.success())
}

#[tauri::command]
fn desktop_set_autostart(enabled: bool) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let task_name = "CyTime 昔时时钟";
        let result = if enabled {
            let executable = std::env::current_exe().map_err(|error| error.to_string())?;
            let command = scheduled_task_command(&executable);
            let arguments = ["/Create", "/TN", task_name, "/SC", "ONLOGON", "/RL", "HIGHEST", "/F", "/TR", command.as_str()];
            // Ask for elevation first, then fall back to a normal user task if UAC is declined.
            if run_scheduled_task(&arguments, true).unwrap_or(false) {
                Some(true)
            } else {
                let fallback = ["/Create", "/TN", task_name, "/SC", "ONLOGON", "/RL", "LIMITED", "/F", "/TR", command.as_str()];
                run_scheduled_task(&fallback, false).ok().filter(|success| *success).map(|_| true)
            }
        } else {
            if run_scheduled_task(&["/Delete", "/TN", task_name, "/F"], false).unwrap_or(false) {
                Some(false)
            } else if run_scheduled_task(&["/Delete", "/TN", task_name, "/F"], true).unwrap_or(false) {
                Some(false)
            } else {
                None
            }
        };
        result.ok_or_else(|| "无法更新开机自启动设置".to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = enabled;
        Err("autostart is currently implemented for Windows only".to_string())
    }
}

#[tauri::command]
async fn desktop_fetch_json(url: String) -> Result<Value, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|error| error.to_string())?;
    let allowed_hosts = [
        "weatherapi.market.xiaomi.com",
        "v1.hitokoto.cn",
        "v1.jinrishici.com",
        "poetry.palemoky.com",
        "api.vvhan.com",
        "api.xygeng.cn",
        "api.adviceslip.com",
        "worldtimeapi.org",
    ];
    if parsed.scheme() != "https" || !parsed.host_str().is_some_and(|host| allowed_hosts.contains(&host)) {
        return Err("network host is not allowed".to_string());
    }
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| error.to_string())?
        .get(parsed)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    response.json::<Value>().await.map_err(|error| error.to_string())
}

#[tauri::command]
async fn desktop_fetch_network_time() -> Result<i64, String> {
    let value = desktop_fetch_json("https://worldtimeapi.org/api/timezone/Etc/UTC".to_string()).await?;
    value.get("unixtime").and_then(Value::as_i64).map(|seconds| seconds * 1000).ok_or_else(|| "time service returned no unix time".to_string())
}

#[tauri::command]
fn desktop_window_action(app: AppHandle, action: String) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or_else(|| "main window unavailable".to_string())?;
    match action.as_str() {
        "minimize" => window.minimize(),
        "maximize" => if window.is_maximized().map_err(|error| error.to_string())? { window.unmaximize() } else { window.maximize() },
        "close" | "hide" => window.hide(),
        "show" => window.show(),
        _ => return Err("unknown window action".to_string()),
    }.map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pending_uris = Arc::new(Mutex::new(Vec::<String>::new()));
    let activation_listener = match TcpListener::bind("127.0.0.1:39268") {
        Ok(listener) => Some(listener),
        Err(_) => {
            if let Ok(mut stream) = TcpStream::connect("127.0.0.1:39268") {
                let payload = std::env::args().skip(1).collect::<Vec<_>>().join("\n");
                let _ = stream.write_all(payload.as_bytes());
            }
            return;
        }
    };
    let auto_start = std::env::args().any(|argument| argument == "--cyrene-auto-start");
    tauri::Builder::default()
        .manage(PendingUris(pending_uris.clone()))
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                window.show().ok();
                window.unminimize().ok();
                window.set_focus().ok();
            }
            for argument in argv.iter().filter(|argument| argument.starts_with("cytime://")) {
                app.emit("cytime:open-url", argument).ok();
            }
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![application_platform, desktop_startup_args, desktop_pending_uris, desktop_set_uri_registration, desktop_window_mode, desktop_set_autostart, desktop_fetch_json, desktop_fetch_network_time, desktop_window_action])
        .setup(move |app| {
            if let Some(listener) = activation_listener {
                let activation_app = app.handle().clone();
                thread::spawn(move || loop {
                    if let Ok((mut stream, _)) = listener.accept() {
                        let mut payload = String::new();
                        let _ = stream.read_to_string(&mut payload);
                        if payload.trim().is_empty() {
                            if let Some(window) = activation_app.get_webview_window("main") { window.show().ok(); window.unminimize().ok(); window.set_focus().ok(); }
                        } else {
                            let arguments = payload.lines().filter(|argument| argument.starts_with("cytime://")).map(String::from).collect::<Vec<_>>();
                            if let Ok(mut pending) = pending_uris.lock() { pending.extend(arguments.iter().cloned()); }
                            for argument in arguments { activation_app.emit("cytime:open-url", argument).ok(); }
                        }
                    }
                });
            }
            if let Some(window) = app.get_webview_window("main") {
                window.set_title("CyTime 昔时时钟").ok();
                if !auto_start { window.show().ok(); }
                let show = MenuItem::with_id(app, "show", "恢复窗口", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "退出 CyTime", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &quit])?;
                TrayIconBuilder::new().icon(include_image!("icons/icon.png")).menu(&menu).on_menu_event(|app, event| {
                    if event.id() == "quit" { app.exit(0); }
                    if event.id() == "show" {
                        if let Some(window) = app.get_webview_window("main") { window.show().ok(); window.unminimize().ok(); window.set_focus().ok(); }
                    }
                }).build(app)?;
                let close_handle = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); close_handle.hide().ok(); }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running CyTime");
}
