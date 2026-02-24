import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";

const dbPath = path.resolve("../server/reactor.db");

let dbInstance: Database<sqlite3.Database, sqlite3.Statement> | null = null;

export async function getDb() {
    if (!dbInstance) {
        dbInstance = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });
    }
    // Enforce Write-Ahead Logging to prevent "database is locked" errors
    // Enforce Write-Ahead Logging and Foreign Keys
    await dbInstance.exec("PRAGMA journal_mode=WAL;");
    await dbInstance.exec("PRAGMA foreign_keys = ON;");
    return dbInstance;
}
