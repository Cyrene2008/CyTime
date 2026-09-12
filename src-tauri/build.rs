use std::process::Command;

fn main() {
    let build_id = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_else(|| "dev".to_string());
    println!("cargo:rustc-env=CYTIME_BUILD_ID={build_id}");
    println!("cargo:rerun-if-changed=../.git/HEAD");
    tauri_build::build()
}
