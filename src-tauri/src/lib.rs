// Côté Rust volontairement vide pour l'instant : toute la logique (Supabase,
// règles métier) vit dans le frontend web (DECISIONS.md §35). Les commandes
// natives (trousseau macOS, notifications…) viendront ici au besoin.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
