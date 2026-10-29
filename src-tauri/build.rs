use std::process::Command;

fn git_value(arguments: &[&str]) -> Option<String> {
    Command::new("git").args(arguments).output().ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|value| !value.is_empty())
}

fn main() {
    let build_id = git_value(&["rev-parse", "--short", "HEAD"]).unwrap_or_else(|| "dev".to_string());
    println!("cargo:rustc-env=CYTIME_BUILD_ID={build_id}");
    let mut names = vec!["HEAD".to_string(), "packed-refs".to_string()];
    if let Some(reference) = git_value(&["symbolic-ref", "--quiet", "HEAD"]) { names.push(reference); }
    for name in names {
        if let Some(path) = git_value(&["rev-parse", "--git-path", &name]) {
            if std::path::Path::new(&path).exists() { println!("cargo:rerun-if-changed={path}"); }
        }
    }
    tauri_build::build()
}
