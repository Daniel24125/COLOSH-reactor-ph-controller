import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";

const dbPath = process.env.DATABASE_URL
    ? path.resolve(process.env.DATABASE_URL)
    : path.resolve("../server/reactor.db");

let dbInstance: Database<sqlite3.Database, sqlite3.Statement> | null = null;

export async function getDb() {
    if (!dbInstance) {
        dbInstance = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });
        // Run PRAGMAs once at connection time, not on every query
        await dbInstance.exec("PRAGMA journal_mode=WAL;");
        await dbInstance.exec("PRAGMA foreign_keys=ON;");
    }
    return dbInstance;
}

