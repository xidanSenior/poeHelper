//! Слежение за Client.txt: отдаём во фронтенд хвост лога при старте и новые строки по мере записи.
//! Читаем только файл лога — никакого доступа к памяти процесса игры.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL: Duration = Duration::from_millis(250);
/// Сколько байт с конца лога прочитать при старте, чтобы восстановить текущую зону.
const BACKLOG_BYTES: u64 = 512 * 1024;

const DEFAULT_PATHS: &[&str] = &[
    r"C:\Program Files (x86)\Grinding Gear Games\Path of Exile\logs\Client.txt",
    r"C:\Program Files\Grinding Gear Games\Path of Exile\logs\Client.txt",
    r"C:\Program Files (x86)\Steam\steamapps\common\Path of Exile\logs\Client.txt",
    r"C:\Program Files\Steam\steamapps\common\Path of Exile\logs\Client.txt",
];

#[derive(Clone, serde::Serialize)]
struct LogBatch {
    lines: Vec<String>,
    backlog: bool,
}

pub struct WatchHandle {
    stop: Arc<AtomicBool>,
}

impl WatchHandle {
    pub fn stop(self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

pub fn detect_default_path() -> Option<String> {
    DEFAULT_PATHS
        .iter()
        .find(|p| Path::new(p).is_file())
        .map(|p| p.to_string())
}

pub fn start(app: AppHandle, path: PathBuf) -> Result<WatchHandle, String> {
    let mut file =
        File::open(&path).map_err(|e| format!("Не удалось открыть {}: {e}", path.display()))?;
    let len = file.metadata().map_err(|e| e.to_string())?.len();

    let from = len.saturating_sub(BACKLOG_BYTES);
    file.seek(SeekFrom::Start(from)).map_err(|e| e.to_string())?;
    let mut chunk = Vec::new();
    file.read_to_end(&mut chunk).map_err(|e| e.to_string())?;

    let mut pending = Vec::new();
    let mut lines = split_lines(&mut pending, &chunk);
    if from > 0 && !lines.is_empty() {
        lines.remove(0); // начали читать с середины строки
    }
    let _ = app.emit("log-lines", LogBatch { lines, backlog: true });

    let stop = Arc::new(AtomicBool::new(false));
    let stop_flag = stop.clone();
    let mut pos = from + chunk.len() as u64;

    thread::spawn(move || {
        while !stop_flag.load(Ordering::Relaxed) {
            thread::sleep(POLL_INTERVAL);
            let Ok(len) = std::fs::metadata(&path).map(|m| m.len()) else { continue };
            if len < pos {
                // Лог очистили или пересоздали — читаем с начала.
                pos = 0;
                pending.clear();
            }
            if len == pos {
                continue;
            }
            let Ok(mut f) = File::open(&path) else { continue };
            if f.seek(SeekFrom::Start(pos)).is_err() {
                continue;
            }
            let mut chunk = Vec::new();
            if f.take(len - pos).read_to_end(&mut chunk).is_err() {
                continue;
            }
            pos += chunk.len() as u64;
            let lines = split_lines(&mut pending, &chunk);
            if !lines.is_empty() {
                let _ = app.emit("log-lines", LogBatch { lines, backlog: false });
            }
        }
    });

    Ok(WatchHandle { stop })
}

/// Дописывает `chunk` к `pending` и возвращает все завершённые строки.
/// Незавершённый хвост остаётся в `pending` до следующего чтения.
fn split_lines(pending: &mut Vec<u8>, chunk: &[u8]) -> Vec<String> {
    pending.extend_from_slice(chunk);
    let mut out = Vec::new();
    let mut start = 0;
    for i in 0..pending.len() {
        if pending[i] == b'\n' {
            let line = String::from_utf8_lossy(&pending[start..i]);
            let line = line.trim_end_matches('\r');
            if !line.is_empty() {
                out.push(line.to_string());
            }
            start = i + 1;
        }
    }
    pending.drain(..start);
    out
}

#[cfg(test)]
mod tests {
    use super::split_lines;

    #[test]
    fn keeps_partial_line_until_newline() {
        let mut pending = Vec::new();
        assert_eq!(split_lines(&mut pending, b"one\r\ntw"), vec!["one"]);
        assert_eq!(split_lines(&mut pending, b"o\r\n"), vec!["two"]);
        assert!(pending.is_empty());
    }

    #[test]
    fn handles_utf8_split_across_chunks() {
        let text = "Акт\n".as_bytes();
        let mut pending = Vec::new();
        assert!(split_lines(&mut pending, &text[..3]).is_empty());
        assert_eq!(split_lines(&mut pending, &text[3..]), vec!["Акт"]);
    }
}
