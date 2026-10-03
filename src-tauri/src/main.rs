// Évite une console supplémentaire sous Windows en release (sans effet sur macOS).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    road_lib::run()
}
