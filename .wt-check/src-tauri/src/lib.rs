// Côté Rust volontairement vide pour l'instant : toute la logique (Supabase,
// règles métier) vit dans le frontend web (DECISIONS.md §35). Les commandes
// natives (trousseau macOS, notifications…) viendront ici au besoin.
// Plugin opener : liens externes ouverts dans le navigateur par défaut
// (src/lib/openExternal.ts), limités à http(s) par capabilities/default.json.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
