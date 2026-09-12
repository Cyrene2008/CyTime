#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::Command;
use std::time::Duration;
use std::thread;
use std::sync::{Arc, Mutex};
use std::fs;
use std::path::PathBuf;
use serde_json::Value;
use tauri::{include_image, AppHandle, Emitter, LogicalSize, Manager, Size, WindowEvent};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri_plugin_deep_link::DeepLinkExt;

struct PendingUris(Arc<Mutex<Vec<String>>>);

fn storage_path(app: &AppHandle) -> Result<PathBuf, String> {
    let executable_dir = std::env::current_exe().ok().and_then(|path| path.parent().map(PathBuf::from)).map(|path| path.join("data").join("cytime-data.json"));
    let app_data = app.path().app_data_dir().map_err(|error| error.to_string())?.join("cytime-data.json");
    if let Some(path) = executable_dir {
        if let Some(parent) = path.parent() {
            if fs::create_dir_all(parent).is_ok() {
                let writable = if path.exists() { fs::OpenOptions::new().append(true).open(&path).is_ok() } else {
                    let probe = parent.join(".cytime-write-test");
                    let result = fs::write(&probe, b"ok").is_ok();
                    let _ = fs::remove_file(probe);
                    result
                };
                if writable {
                return Ok(path);
                }
            }
        }
    }
    if let Some(parent) = app_data.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    Ok(app_data)
}

fn write_json_file(path: &PathBuf, value: &Value) -> Result<(), String> {
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    fs::rename(&temporary, path).map_err(|error| error.to_string())
}

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

static STORAGE_LOCK: Mutex<()> = Mutex::new(());

fn read_storage_inner(app: &AppHandle) -> Result<Value, String> {
    let path = storage_path(app)?;
    if !path.exists() { return Ok(Value::Object(serde_json::Map::new())); }
    serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
}

#[tauri::command]
fn storage_read_all(app: AppHandle) -> Result<Value, String> {
    let _guard = STORAGE_LOCK.lock().map_err(|error| error.to_string())?;
    read_storage_inner(&app)
}

#[tauri::command]
fn storage_write(app: AppHandle, key: String, value: Value) -> Result<(), String> {
    let _guard = STORAGE_LOCK.lock().map_err(|error| error.to_string())?;
    let path = storage_path(&app)?;
    let mut all = read_storage_inner(&app)?;
    all.as_object_mut().ok_or_else(|| "storage is not an object".to_string())?.insert(key, value);
    write_json_file(&path, &all)
}

#[tauri::command]
fn desktop_write_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
async fn desktop_check_update() -> Result<Value, String> {
    desktop_fetch_json("https://api.github.com/repos/Cyrene2008/CyTime/releases/latest".to_string()).await
}

#[tauri::command]
async fn desktop_download_update(url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|error| error.to_string())?;
    if parsed.scheme() != "https" || parsed.host_str() != Some("github.com") { return Err("update URL is not allowed".to_string()); }
    let bytes = reqwest::Client::builder().timeout(Duration::from_secs(120)).build().map_err(|error| error.to_string())?.get(parsed).send().await.map_err(|error| error.to_string())?.error_for_status().map_err(|error| error.to_string())?.bytes().await.map_err(|error| error.to_string())?;
    let path = std::env::temp_dir().join("CyTime-update.exe");
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Command::new(&path).spawn().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn desktop_set_uri_registration(app: AppHandle, enabled: bool) -> Result<bool, String> {
    if enabled { app.deep_link().register("cytime").map_err(|error| error.to_string())?; }
    else { app.deep_link().unregister("cytime").map_err(|error| error.to_string())?; }
    Ok(enabled)
}

#[tauri::command]
fn desktop_window_mode(app: AppHandle, mode: String, reveal: Option<bool>) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or_else(|| "main window unavailable".to_string())?;
    match mode.as_str() {
        "mini" => {
            window.set_resizable(false).map_err(|error| error.to_string())?;
            window.set_min_size(Some(Size::Logical(LogicalSize::new(1280.0, 960.0)))).map_err(|error| error.to_string())?;
            window.set_max_size(Some(Size::Logical(LogicalSize::new(1280.0, 960.0)))).map_err(|error| error.to_string())?;
            window.set_fullscreen(false).map_err(|error| error.to_string())?;
            window.unmaximize().map_err(|error| error.to_string())?;
            window.set_size(Size::Logical(LogicalSize::new(1280.0, 960.0))).map_err(|error| error.to_string())?;
        }
        "normal" => {
            window.set_resizable(true).map_err(|error| error.to_string())?;
            window.set_min_size(Some(Size::Logical(LogicalSize::new(1280.0, 720.0)))).map_err(|error| error.to_string())?;
            window.set_max_size(None::<Size>).map_err(|error| error.to_string())?;
            window.set_fullscreen(false).map_err(|error| error.to_string())?;
            window.unmaximize().map_err(|error| error.to_string())?;
            window.set_size(Size::Logical(LogicalSize::new(1600.0, 1000.0))).map_err(|error| error.to_string())?;
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
    if reveal.unwrap_or(true) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
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
        "timeapi.io",
        "time.cyrene.hk",
        "ipwho.is",
        "ipapi.co",
        "api.bigdatacloud.net",
        "api.github.com",
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![application_platform, desktop_startup_args, desktop_pending_uris, storage_read_all, storage_write, desktop_write_file, desktop_check_update, desktop_download_update, desktop_set_uri_registration, desktop_window_mode, desktop_set_autostart, desktop_fetch_json, desktop_fetch_network_time, desktop_window_action])
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
