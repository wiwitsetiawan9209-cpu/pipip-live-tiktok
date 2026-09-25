import { DatabaseSync } from 'node:sqlite';
export function initializeDatabase(path: string): DatabaseSync {
 const db = new DatabaseSync(path);
 db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
 db.exec(`CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL CHECK(status IN ('running','stopped'))); CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price REAL, currency TEXT, stock INTEGER, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER REFERENCES sessions(id), timestamp TEXT NOT NULL, type TEXT NOT NULL, payload_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
 return db;
}
