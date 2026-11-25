#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use walkdir::WalkDir;

const COLOR_CYCLE: [&str; 8] = [
    "blue", "emerald", "teal", "amber", "rose", "indigo", "violet", "slate",
];

fn calendar_name_key(file_name_or_path: &str) -> String {
    let base = file_name_or_path
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(file_name_or_path);
    let stem = base
        .strip_suffix(".ics")
        .or_else(|| base.strip_suffix(".ICS"))
        .unwrap_or_else(|| {
            if base.to_ascii_lowercase().ends_with(".ics") && base.len() > 4 {
                &base[..base.len() - 4]
            } else {
                base
            }
        });
    stem.trim().to_ascii_lowercase()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CalendarPref {
    color: Option<String>,
    visible: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AeonConfig {
    custom_root_dir: Option<String>,
    #[serde(default)]
    prefs: HashMap<String, CalendarPref>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriFolderInfo {
    root_folder_name: String,
    is_default: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriScannedFile {
    file_name: String,
    relative_path: String,
    raw_ics: String,
    color: String,
    visible: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriScanResult {
    root_folder_name: String,
    is_default: bool,
    files: Vec<TauriScannedFile>,
}

fn sanitize_log(text: &str) -> String {
    text.chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .trim()
        .to_string()
}

#[cfg(target_os = "linux")]
fn configure_debian_wayland() {
    // Work around WebKitGTK 4.1 DMA-BUF blank window / Wayland protocol error 71
    // across GNOME Mutter, KDE KWin, wlroots (Sway/Hyprland), and NVIDIA/Mesa.
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".into());
    let wayland_display = std::env::var("WAYLAND_DISPLAY").unwrap_or_else(|_| "unset".into());
    let gdk_backend = std::env::var("GDK_BACKEND").unwrap_or_else(|_| "auto(wayland,x11)".into());
    let dmabuf_disabled =
        std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").unwrap_or_else(|_| "0".into());

    eprintln!(
        "[aeon] INFO  Display environment: XDG_SESSION_TYPE={}, WAYLAND_DISPLAY={}, GDK_BACKEND={}, WEBKIT_DISABLE_DMABUF_RENDERER={}",
        sanitize_log(&session_type),
        sanitize_log(&wayland_display),
        sanitize_log(&gdk_backend),
        sanitize_log(&dmabuf_disabled)
    );
}

fn config_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Unable to resolve config directory: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Unable to create config directory: {e}"))?;
    Ok(dir.join("settings.json"))
}

fn default_calendars_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Unable to resolve data directory: {e}"))?
        .join("calendars");
    fs::create_dir_all(&dir).map_err(|e| format!("Unable to create calendars directory: {e}"))?;
    Ok(dir)
}

fn load_config(app: &AppHandle) -> AeonConfig {
    let Ok(path) = config_file_path(app) else {
        return AeonConfig::default();
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return AeonConfig::default();
    };
    serde_json::from_str::<AeonConfig>(&raw).unwrap_or_default()
}

fn save_config(app: &AppHandle, config: &AeonConfig) -> Result<(), String> {
    let path = config_file_path(app)?;
    let json =
        serde_json::to_string_pretty(config).map_err(|e| format!("Failed to serialize config: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write config: {e}"))
}

fn resolve_active_root(app: &AppHandle) -> Result<(PathBuf, bool), String> {
    let cfg = load_config(app);
    if let Some(custom) = cfg.custom_root_dir {
        let p = PathBuf::from(&custom);
        if p.is_dir() {
            return Ok((p, false));
        }
        eprintln!(
            "[aeon] WARN  Configured folder \"{}\" is unavailable; falling back to default.",
            sanitize_log(&custom)
        );
    }
    let def = default_calendars_dir(app)?;
    Ok((def, true))
}

fn folder_display_name(root: &Path, is_default: bool) -> String {
    if is_default {
        return "Calendars (Local)".to_string();
    }
    root.file_name()
        .and_then(|n| n.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("Calendars")
        .to_string()
}

fn is_valid_relative_ics_path(rel: &str) -> bool {
    if rel.is_empty() || rel.contains("..") || rel.starts_with('/') || rel.contains('\\') {
        return false;
    }
    let segments: Vec<&str> = rel.split('/').collect();
    if segments.is_empty() {
        return false;
    }
    for seg in segments {
        if seg.is_empty() || seg.starts_with('.') {
            return false;
        }
        if !seg
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        {
            return false;
        }
    }
    rel.to_ascii_lowercase().ends_with(".ics")
}

fn resolve_inside_root(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    if !is_valid_relative_ics_path(relative_path) {
        return Err("Invalid .ics relative path.".to_string());
    }
    let mut target = root.to_path_buf();
    for seg in relative_path.split('/') {
        target.push(seg);
    }
    for comp in Path::new(relative_path).components() {
        if !matches!(comp, Component::Normal(_)) {
            return Err("Path escapes root folder.".to_string());
        }
    }
    if !target.starts_with(root) {
        return Err("Path escapes root folder.".to_string());
    }
    Ok(target)
}

fn verify_folder_read_write(dir: &Path) -> Result<(), String> {
    fs::read_dir(dir).map_err(|e| format!("Cannot read selected folder: {e}"))?;
    let probe = dir.join(format!(".aeon-write-check-{}", std::process::id()));
    fs::write(&probe, b"ok").map_err(|e| format!("Folder is not writable: {e}"))?;
    let _ = fs::remove_file(&probe);
    Ok(())
}

#[tauri::command]
async fn pick_calendar_folder(app: AppHandle) -> Result<Option<TauriFolderInfo>, String> {
    let dialog_app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_title("Choose Calendar Folder")
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| format!("Folder picker failed: {e}"))?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|e| format!("Selected path is not a local directory: {e}"))?;
    verify_folder_read_write(&path)?;

    let mut cfg = load_config(&app);
    cfg.custom_root_dir = Some(path.to_string_lossy().to_string());
    save_config(&app, &cfg)?;

    let name = folder_display_name(&path, false);
    eprintln!(
        "[aeon] INFO  Mounted local calendar folder: \"{}\" ({})",
        sanitize_log(&name),
        path.display()
    );
    Ok(Some(TauriFolderInfo {
        root_folder_name: name,
        is_default: false,
    }))
}

#[tauri::command]
fn reset_calendar_folder(app: AppHandle) -> Result<TauriFolderInfo, String> {
    let mut cfg = load_config(&app);
    cfg.custom_root_dir = None;
    save_config(&app, &cfg)?;

    let def = default_calendars_dir(&app)?;
    let name = folder_display_name(&def, true);
    eprintln!("[aeon] INFO  Reset calendar folder to default: {}", def.display());
    Ok(TauriFolderInfo {
        root_folder_name: name,
        is_default: true,
    })
}

#[tauri::command]
fn scan_ics_folder(app: AppHandle) -> Result<TauriScanResult, String> {
    let (root, is_default) = resolve_active_root(&app)?;
    let cfg = load_config(&app);

    let mut discovered: Vec<(String, String, PathBuf)> = Vec::new();
    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            !e.file_name()
                .to_str()
                .map(|s| s.starts_with('.'))
                .unwrap_or(false)
        })
        .flatten()
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_ics = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("ics"))
            .unwrap_or(false);
        if !is_ics {
            continue;
        }
        let Ok(rel) = path.strip_prefix(&root) else {
            continue;
        };
        let rel_str = rel
            .iter()
            .map(|s| s.to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/");
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("calendar.ics")
            .to_string();
        discovered.push((file_name, rel_str, path.to_path_buf()));
    }

    discovered.sort_by(|a, b| a.0.cmp(&b.0));

    let mut files = Vec::with_capacity(discovered.len());
    for (idx, (file_name, relative_path, full_path)) in discovered.into_iter().enumerate() {
        match fs::read_to_string(&full_path) {
            Ok(raw_ics) => {
                let name_key = calendar_name_key(&file_name);
                let pref = cfg
                    .prefs
                    .get(&name_key)
                    .or_else(|| cfg.prefs.get(&relative_path));
                let color = pref
                    .and_then(|p| p.color.clone())
                    .filter(|c| COLOR_CYCLE.contains(&c.as_str()))
                    .unwrap_or_else(|| COLOR_CYCLE[idx % COLOR_CYCLE.len()].to_string());
                let visible = pref.and_then(|p| p.visible).unwrap_or(true);

                files.push(TauriScannedFile {
                    file_name,
                    relative_path,
                    raw_ics,
                    color,
                    visible,
                });
            }
            Err(err) => {
                eprintln!(
                    "[aeon] WARN  Failed to read {}: {}",
                    full_path.display(),
                    err
                );
            }
        }
    }

    let root_folder_name = folder_display_name(&root, is_default);
    eprintln!(
        "[aeon] INFO  Scanned \"{}\": {} .ics calendar file(s)",
        sanitize_log(&root_folder_name),
        files.len()
    );

    Ok(TauriScanResult {
        root_folder_name,
        is_default,
        files,
    })
}

#[tauri::command]
fn read_ics_file(app: AppHandle, relative_path: String) -> Result<Option<String>, String> {
    let (root, _) = resolve_active_root(&app)?;
    let target = resolve_inside_root(&root, &relative_path)?;
    if !target.exists() {
        return Ok(None);
    }
    let content =
        fs::read_to_string(&target).map_err(|e| format!("Failed to read .ics file: {e}"))?;
    Ok(Some(content))
}

#[tauri::command]
fn write_ics_file(
    app: AppHandle,
    relative_path: String,
    content: String,
    create_only: bool,
) -> Result<(), String> {
    let (root, _) = resolve_active_root(&app)?;
    let target = resolve_inside_root(&root, &relative_path)?;
    if create_only && target.exists() {
        return Err(format!("{} already exists.", sanitize_log(&relative_path)));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create calendar directory: {e}"))?;
    }
    fs::write(&target, content).map_err(|e| format!("Failed to write .ics file: {e}"))?;
    eprintln!(
        "[aeon] INFO  Wrote .ics file: \"{}\"",
        sanitize_log(&relative_path)
    );
    Ok(())
}

#[tauri::command]
fn update_calendar_prefs(
    app: AppHandle,
    relative_path: String,
    color: Option<String>,
    visible: Option<bool>,
) -> Result<(), String> {
    let name_key = calendar_name_key(&relative_path);
    if name_key.is_empty() || name_key.contains("..") {
        return Err("Invalid calendar name.".to_string());
    }
    let mut cfg = load_config(&app);
    let entry = cfg.prefs.entry(name_key.clone()).or_default();
    if let Some(c) = color {
        if COLOR_CYCLE.contains(&c.as_str()) {
            entry.color = Some(c);
        }
    }
    if let Some(v) = visible {
        entry.visible = Some(v);
    }
    save_config(&app, &cfg)?;
    eprintln!(
        "[aeon] INFO  Saved calendar preferences for \"{}\"",
        sanitize_log(&name_key)
    );
    Ok(())
}

#[tauri::command]
fn log_from_frontend(level: String, action: String, detail: String) {
    let lvl = match level.to_ascii_uppercase().as_str() {
        "ERROR" => "ERROR",
        "WARN" => "WARN ",
        _ => "INFO ",
    };
    eprintln!(
        "[aeon] {} [{}:{}] {}",
        lvl,
        "tauri",
        sanitize_log(&action),
        sanitize_log(&detail)
    );
}

fn main() {
    #[cfg(target_os = "linux")]
    configure_debian_wayland();

    eprintln!(
        "[aeon] INFO  Launching Aeon desktop shell (pid={})",
        std::process::id()
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let handle = app.handle();
            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = handle.default_window_icon().cloned() {
                    if let Err(err) = window.set_icon(icon) {
                        eprintln!("[aeon] WARN  Failed to set window icon: {err}");
                    }
                }
            }
            if let Ok((root, is_default)) = resolve_active_root(handle) {
                eprintln!(
                    "[aeon] INFO  Active calendars root ({}): {}",
                    if is_default { "default" } else { "custom" },
                    root.display()
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_calendar_folder,
            reset_calendar_folder,
            scan_ics_folder,
            read_ics_file,
            write_ics_file,
            update_calendar_prefs,
            log_from_frontend
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aeon");
}
