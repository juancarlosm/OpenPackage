// OpenPackage GUI - Tauri Backend
//
// This is the minimal Tauri shell. The actual business logic lives in
// @opkg/core (TypeScript) and is invoked from the frontend via Tauri
// commands that call into the JS runtime.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
