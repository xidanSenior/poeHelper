// Без консольного окна в release-сборке.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    poe_overlay_lib::run()
}
