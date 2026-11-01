/**
 * Ouverture de la base SQLite et création du schéma.
 *
 * Choix technique (voir CDC 5.1 et contraintes Wispbyte) :
 *  - `node:sqlite` est embarqué dans Node.js 24 → AUCUNE compilation native,
 *    contrairement à `better-sqlite3` qui peut échouer sur le plan gratuit.
 *  - Repli automatique sur `better-sqlite3` si `node:sqlite` n'est pas disponible
 *    (Node 22.5 à 23.3, ou image différente).
 *
 * L'API exposée est volontairement minimale et identique dans les deux cas :
 *   db.exec(sql) / db.prepare(sql).run(...)/.get(...)/.all(...)
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import log from './logger.js';

/** Convertit une valeur JS en valeur acceptée par SQLite (pas de booléen). */
export const toSql = (v) => (v === undefined || v === null ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
/** Convertit une valeur SQLite 0/1/NULL en booléen JS. */
export const fromSql = (v) => v === 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id                TEXT PRIMARY KEY,
  channel_id              TEXT,
  role_id                 TEXT,
  rotations_channel_id    TEXT,
  enabled_types           TEXT NOT NULL DEFAULT 'all',
  reminder_minutes        INTEGER NOT NULL DEFAULT 60,
  reminder_24h            INTEGER NOT NULL DEFAULT 0,
  rotation_raids          INTEGER NOT NULL DEFAULT 1,
  rotation_eggs           INTEGER NOT NULL DEFAULT 1,
  rotation_vedettes       INTEGER NOT NULL DEFAULT 1,
  lang                    TEXT NOT NULL DEFAULT 'fr',
  updated_at              TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  dedupe_key    TEXT NOT NULL,   -- slug du titre : évite les doublons si la source change
  title         TEXT NOT NULL,
  type          TEXT NOT NULL,
  time_mode     TEXT NOT NULL DEFAULT 'absolute',  -- 'absolute' (UTC connu) | 'local' (heure locale du joueur)
  start_utc     TEXT,                              -- ISO 8601 UTC si time_mode = 'absolute'
  end_utc       TEXT,
  start_raw     TEXT,                              -- chaîne d'origine (heure locale si time_mode = 'local')
  end_raw       TEXT,
  image         TEXT,
  link          TEXT,
  description   TEXT,
  details       TEXT,                              -- JSON : bonus, boss, vedettes, etc.
  place_name    TEXT,
  latitude      REAL,
  longitude     REAL,
  timezone      TEXT,                              -- fuseau IANA du lieu
  content_hash  TEXT,                              -- détecte les mises à jour d'un événement existant
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS rotations (
  category      TEXT NOT NULL,   -- 'raids' | 'eggs' | 'vedettes'
  bucket        TEXT NOT NULL,   -- palier (1*, 3*, 5*, Méga…) ou distance (2 km, 5 km…)
  name          TEXT NOT NULL,
  image         TEXT,
  can_be_shiny  INTEGER NOT NULL DEFAULT 0,
  details       TEXT,            -- JSON : types, CP, bonus…
  start_utc     TEXT,
  end_utc       TEXT,
  updated_at    TEXT,
  PRIMARY KEY (category, bucket, name)
);

CREATE TABLE IF NOT EXISTS rotation_state (
  category      TEXT PRIMARY KEY,
  content_hash  TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  target_id  TEXT NOT NULL,   -- identifiant d'événement, ou catégorie de rotation
  guild_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,   -- 'new' | 'reminder' | 'reminder24' | 'start' | 'rotation'
  sent_at    TEXT NOT NULL,
  PRIMARY KEY (target_id, guild_id, kind)
);

CREATE TABLE IF NOT EXISTS geocache (
  query        TEXT PRIMARY KEY,
  display_name TEXT,
  latitude     REAL,
  longitude    REAL,
  timezone     TEXT,
  fetched_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_utc);
CREATE INDEX IF NOT EXISTS idx_events_dedupe ON events(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_notifications_guild ON notifications(guild_id);
`;

let handle = null;

/** Ouvre la base (création du dossier si besoin) et applique le schéma. */
export async function openDatabase(dbPath) {
  if (handle) return handle;
  const file = resolve(dbPath);
  mkdirSync(dirname(file), { recursive: true });

  let DatabaseSync = null;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch {
    try {
      const mod = await import('better-sqlite3');
      DatabaseSync = class BetterSqliteCompat {
        constructor(f) {
          this._db = new mod.default(f);
          this._real = true;
        }
        exec(sql) { return this._db.exec(sql); }
        prepare(sql) {
          const st = this._db.prepare(sql);
          return {
            run: (...p) => st.run(...p),
            get: (...p) => st.get(...p),
            all: (...p) => st.all(...p),
          };
        }
        close() { this._db.close(); }
      };
      log.warn('node:sqlite indisponible → repli sur better-sqlite3.');
    } catch (err) {
      throw new Error(
        'Aucun moteur SQLite disponible. Utilisez Node.js >= 22.5 (de préférence 24) ' +
        'ou lancez `npm install better-sqlite3`. Détail : ' + err.message,
      );
    }
  }

  handle = new DatabaseSync(file);
  // Réglages de fiabilité/perf : WAL (reprise propre après coupure) + NORMAL.
  try {
    handle.exec('PRAGMA journal_mode = WAL;');
    handle.exec('PRAGMA synchronous = NORMAL;');
    handle.exec('PRAGMA busy_timeout = 5000;');
  } catch (err) {
    log.warn('Pragma non appliqué :', err.message);
  }
  handle.exec(SCHEMA);
  log.info(`Base SQLite ouverte : ${file}`);
  return handle;
}

/** Renvoie le handle SQLite (openDatabase doit avoir été appelé au préalable). */
export function getDb() {
  if (!handle) throw new Error('Base non ouverte : openDatabase() doit être appelée avant.');
  return handle;
}

/** Ferme proprement la base (arrêt gracieux du bot). */
export function closeDatabase() {
  if (handle) {
    try { handle.close(); } catch { /* déjà fermée */ }
    handle = null;
  }
}
