import * as SQLite from "expo-sqlite";
let db;
export async function getDb(){if(!db) db=await SQLite.openDatabaseAsync("misevo.db");return db;}
export async function initDatabase(){const d=await getDb();await d.execAsync(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS insumos(id INTEGER PRIMARY KEY AUTOINCREMENT, ingrediente TEXT NOT NULL, unidade TEXT NOT NULL DEFAULT 'KG', peso_bruto REAL NOT NULL DEFAULT 1, peso_liquido REAL NOT NULL DEFAULT 1, fc REAL NOT NULL DEFAULT 1, preco_compra REAL NOT NULL DEFAULT 0, preco_real REAL NOT NULL DEFAULT 0, fornecedor TEXT DEFAULT '', ativo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS fichas(id INTEGER PRIMARY KEY AUTOINCREMENT,nome_prato TEXT NOT NULL,categoria TEXT NOT NULL DEFAULT 'Outros',rendimento_kg REAL DEFAULT 0,porcoes REAL DEFAULT 1,preco_venda REAL DEFAULT 0,meta_cmv REAL DEFAULT 30,modo_preparo TEXT DEFAULT '',ativo INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS ingredientes(id INTEGER PRIMARY KEY AUTOINCREMENT,ficha_id INTEGER NOT NULL,insumo_id INTEGER NOT NULL,quantidade REAL NOT NULL DEFAULT 0,unidade TEXT NOT NULL DEFAULT 'KG',ordem INTEGER DEFAULT 0,FOREIGN KEY(ficha_id) REFERENCES fichas(id) ON DELETE CASCADE,FOREIGN KEY(insumo_id) REFERENCES insumos(id));`);}
export async function dashboard(){const d=await getDb();const i=await d.getFirstAsync("SELECT COUNT(*) total FROM insumos WHERE ativo=1");const f=await d.getFirstAsync("SELECT COUNT(*) total FROM fichas WHERE ativo=1");return {insumos:i?.total||0,fichas:f?.total||0};}
