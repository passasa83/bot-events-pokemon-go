/**
 * Couche de stockage (module de stockage – CDC 5.4).
 * Aucune requête SQL ailleurs que dans ce fichier : facilite la maintenance
 * et le remplacement éventuel du moteur.
 */

import { getDb, toSql, fromSql } from './db.js';
import { slugKey } from './util.js';
import log from './logger.js';

/* ------------------------------------------------------------------ */
/* Configuration par serveur (CDC 4.4)                                 */
/* ------------------------------------------------------------------ */

export const DEFAULT_GUILD_CONFIG = Object.freeze({
  channelId: null,
  roleId: null,
  rotationsChannelId: null,
  enabledTypes: null, // null = tous les types
  reminderMinutes: 60,
  reminder24h: false,
  rotationRaids: true,
  rotationEggs: true,
  rotationVedettes: true,
  lang: 'fr',
});

const rowToConfig = (row) => {
  if (!row) return { ...DEFAULT_GUILD_CONFIG };
  let types = null;
  if (row.enabled_types && row.enabled_types !== 'all') {
    try { types = JSON.parse(row.enabled_types); } catch { types = null; }
  }
  return {
    channelId: row.channel_id ?? null,
    roleId: row.role_id ?? null,
    rotationsChannelId: row.rotations_channel_id ?? null,
    enabledTypes: types,
    reminderMinutes: row.reminder_minutes ?? DEFAULT_GUILD_CONFIG.reminderMinutes,
    reminder24h: fromSql(row.reminder_24h),
    rotationRaids: fromSql(row.rotation_raids),
    rotationEggs: fromSql(row.rotation_eggs),
    rotationVedettes: fromSql(row.rotation_vedettes),
    lang: row.lang === 'en' ? 'en' : 'fr',
  };
};

export function getGuildConfig(guildId) {
  const row = getDb().prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  return rowToConfig(row);
}

export function getAllGuildConfigs() {
  return getDb().prepare('SELECT * FROM guild_config').all().map(rowToConfig);
}

/** Met à jour partiellement la configuration d'un serveur (upsert). */
export function setGuildConfig(guildId, patch) {
  const current = getGuildConfig(guildId);
  const next = { ...current, ...patch };
  getDb().prepare(`
    INSERT INTO guild_config (guild_id, channel_id, role_id, rotations_channel_id, enabled_types,
                              reminder_minutes, reminder_24h, rotation_raids, rotation_eggs,
                              rotation_vedettes, lang, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      role_id = excluded.role_id,
      rotations_channel_id = excluded.rotations_channel_id,
      enabled_types = excluded.enabled_types,
      reminder_minutes = excluded.reminder_minutes,
      reminder_24h = excluded.reminder_24h,
      rotation_raids = excluded.rotation_raids,
      rotation_eggs = excluded.rotation_eggs,
      rotation_vedettes = excluded.rotation_vedettes,
      lang = excluded.lang,
      updated_at = excluded.updated_at
  `).run(
    guildId,
    next.channelId,
    next.roleId,
    next.rotationsChannelId,
    next.enabledTypes ? JSON.stringify(next.enabledTypes) : 'all',
    next.reminderMinutes,
    toSql(next.reminder24h),
    toSql(next.rotationRaids),
    toSql(next.rotationEggs),
    toSql(next.rotationVedettes),
    next.lang,
    new Date().toISOString(),
  );
  return next;
}

/** Vrai si ce type d'événement est suivi par ce serveur (null = tous, [] = aucun). */
export function isTypeEnabled(config, type) {
  if (config.enabledTypes === null || config.enabledTypes === undefined) return true;
  return config.enabledTypes.includes(type);
}

/* ------------------------------------------------------------------ */
/* Événements (CDC 4.1)                                                */
/* ------------------------------------------------------------------ */

const rowToEvent = (row) => ({
  id: row.id,
  title: row.title,
  type: row.type,
  timeMode: row.time_mode,
  startUtc: row.start_utc ? new Date(row.start_utc) : null,
  endUtc: row.end_utc ? new Date(row.end_utc) : null,
  startRaw: row.start_raw,
  endRaw: row.end_raw,
  image: row.image,
  link: row.link,
  description: row.description,
  details: row.details ? safeJson(row.details) : null,
  placeName: row.place_name,
  latitude: row.latitude,
  longitude: row.longitude,
  timezone: row.timezone,
  updatedAt: row.updated_at,
});

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/** ISO 8601 ou null : protège l'enregistrement contre une date invalide. */
const isoOrNull = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);

/**
 * Enregistre (ou met à jour) un événement normalisé.
 * Recherche par identifiant **ou** par empreinte de titre : si la source de
 * secours prend le relais avec des identifiants différents, aucun doublon n'est
 * créé et aucune notification « nouvel événement » n'est renvoyée.
 * @returns {{isNew:boolean, changed:boolean, id:string}}
 */
export function upsertEvent(ev, contentHash) {
  const db = getDb();
  const dedupeKey = ev.dedupeKey || slugKey(ev.title);

  // 1. Identifiant exact ; 2. sinon, événement équivalent (autre source).
  let existing = db.prepare('SELECT id, content_hash, dedupe_key FROM events WHERE id = ?').get(ev.id);
  // Garde-fou : si deux événements distincts portent le même identifiant
  // (homonymes à deux dates), on rend l'identifiant entrant unique plutôt
  // que d'écraser le premier.
  let incoming = ev;
  if (existing && existing.dedupe_key !== dedupeKey) {
    incoming = { ...ev, id: `${ev.id}--${dedupeKey.slice(-14)}` };
    existing = null;
  }
  if (!existing) existing = db.prepare('SELECT id, content_hash FROM events WHERE dedupe_key = ?').get(dedupeKey);

  if (existing && existing.content_hash === contentHash) return { isNew: false, changed: false, id: existing.id };
  const rowId = existing ? existing.id : incoming.id;

  db.prepare(`
    INSERT INTO events (id, dedupe_key, title, type, time_mode, start_utc, end_utc, start_raw, end_raw, image, link,
                        description, details, place_name, latitude, longitude, timezone, content_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      dedupe_key = excluded.dedupe_key,
      title = excluded.title, type = excluded.type, time_mode = excluded.time_mode,
      start_utc = excluded.start_utc, end_utc = excluded.end_utc,
      start_raw = excluded.start_raw, end_raw = excluded.end_raw,
      image = excluded.image, link = excluded.link, description = excluded.description,
      details = excluded.details, place_name = excluded.place_name,
      latitude = excluded.latitude, longitude = excluded.longitude, timezone = excluded.timezone,
      content_hash = excluded.content_hash, updated_at = excluded.updated_at
  `).run(
    rowId, dedupeKey, ev.title, ev.type, ev.timeMode,
    isoOrNull(ev.startUtc),
    isoOrNull(ev.endUtc),
    ev.startRaw, ev.endRaw, ev.image, ev.link,
    ev.description, ev.details ? JSON.stringify(ev.details) : null,
    ev.placeName, ev.latitude, ev.longitude, ev.timezone,
    contentHash, new Date().toISOString(),
  );
  return { isNew: !existing, changed: Boolean(existing), id: rowId };
}

/** Empreinte de titre – voir `util.js` (exportée ici par commodité). */
export { slugKey };

/** Événements à venir (et en cours), triés par date de début. */
export function getUpcomingEvents({ includePastDays = 1 } = {}) {
  const since = new Date(Date.now() - includePastDays * 86400000).toISOString();
  const rows = getDb().prepare(`
    SELECT * FROM events
    WHERE end_utc IS NULL OR end_utc >= ?
    ORDER BY COALESCE(start_utc, end_utc) ASC
    LIMIT 300
  `).all(since);
  return rows.map(rowToEvent);
}

export function getEvent(id) {
  const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(id);
  return row ? rowToEvent(row) : null;
}

/** Recherche partielle d'événements par titre (utilisée par /admin location). */
export function findEventsByName(term) {
  const rows = getDb().prepare(
    "SELECT * FROM events WHERE LOWER(title) LIKE ? ORDER BY COALESCE(start_utc, end_utc) DESC LIMIT 10",
  ).all(`%${String(term).toLowerCase()}%`);
  return rows.map(rowToEvent);
}

/** Correction manuelle des coordonnées (CDC 4.5 – /admin location). */
export function overrideEventLocation(id, { placeName, latitude, longitude, timezone }) {
  const res = getDb().prepare(`
    UPDATE events SET place_name = ?, latitude = ?, longitude = ?, timezone = ?, updated_at = ?
    WHERE id = ?
  `).run(placeName, latitude, longitude, timezone, new Date().toISOString(), id);
  return res.changes > 0;
}

/* ------------------------------------------------------------------ */
/* Notifications – anti-doublons (CDC 4.1 et 6)                        */
/* ------------------------------------------------------------------ */

/**
 * Marque une notification comme envoyée.
 * @returns {boolean} true si la notification devait être envoyée (pas encore envoyée),
 *                    false si elle l'était déjà (doublon évité après redémarrage).
 */
export function claimNotification(targetId, guildId, kind) {
  const res = getDb().prepare(
    'INSERT OR IGNORE INTO notifications (target_id, guild_id, kind, sent_at) VALUES (?, ?, ?, ?)',
  ).run(targetId, guildId, kind, new Date().toISOString());
  return res.changes > 0;
}

export function wasNotified(targetId, guildId, kind) {
  return Boolean(getDb().prepare(
    'SELECT 1 FROM notifications WHERE target_id = ? AND guild_id = ? AND kind = ?',
  ).get(targetId, guildId, kind));
}

/** Oublie une notification (utile pour relancer un test en local). */
export function forgetNotification(targetId, guildId, kind) {
  getDb().prepare('DELETE FROM notifications WHERE target_id = ? AND guild_id = ? AND kind = ?')
    .run(targetId, guildId, kind);
}

/* ------------------------------------------------------------------ */
/* Rotations (CDC 4.7)                                                 */
/* ------------------------------------------------------------------ */

/** Empreinte de rotation courante (null si jamais vue). */
export function getRotationHash(category) {
  const row = getDb().prepare('SELECT content_hash FROM rotation_state WHERE category = ?').get(category);
  return row ? row.content_hash : null;
}

/**
 * Enregistre l'empreinte d'une rotation.
 * @returns {boolean|null} true si la rotation a CHANGÉ, false si inchangée,
 *                         null si aucune empreinte précédente (premier passage).
 */
export function setRotationHash(category, hash) {
  const db = getDb();
  const existing = db.prepare('SELECT content_hash FROM rotation_state WHERE category = ?').get(category);
  const now = new Date().toISOString();
  if (!existing) {
    db.prepare('INSERT INTO rotation_state (category, content_hash, first_seen_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(category, hash, now, now);
    return null;
  }
  if (existing.content_hash === hash) return false;
  db.prepare('UPDATE rotation_state SET content_hash = ?, updated_at = ? WHERE category = ?').run(hash, now, category);
  return true;
}

/** Force la notification de la prochaine rotation (test / rattrapage manuel). */
export function resetRotationHash(category) {
  getDb().prepare('DELETE FROM rotation_state WHERE category = ?').run(category);
}

/**
 * Marque une rotation comme « à annoncer au prochain cycle » (empreinte forcée,
 * utilisée par `/admin rotation-reset`). Combine avec forgetRotationNotifications
 * pour que l'annonce soit réellement envoyée.
 */
export function forceRotationNotify(category) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO rotation_state (category, content_hash, first_seen_at, updated_at)
    VALUES (?, 'forced', ?, ?)
    ON CONFLICT(category) DO UPDATE SET content_hash = 'forced', updated_at = excluded.updated_at
  `).run(category, now, now);
}

/** Oublie les notifications de rotation déjà envoyées (permet une nouvelle annonce). */
export function forgetRotationNotifications(category) {
  getDb().prepare("DELETE FROM notifications WHERE target_id = ? AND kind = 'rotation'").run(`rotation:${category}`);
}

export function getRotationItems(category) {
  return getDb().prepare('SELECT * FROM rotations WHERE category = ? ORDER BY bucket, name').all(category)
    .map((r) => ({
      category: r.category,
      bucket: r.bucket,
      name: r.name,
      image: r.image,
      canBeShiny: fromSql(r.can_be_shiny),
      details: r.details ? safeJson(r.details) : null,
      startUtc: r.start_utc ? new Date(r.start_utc) : null,
      endUtc: r.end_utc ? new Date(r.end_utc) : null,
    }));
}

/** Remplace entièrement le contenu courant d'une catégorie de rotation. */
export function replaceRotationItems(category, items) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('DELETE FROM rotations WHERE category = ?').run(category);
  const stmt = db.prepare(`
    INSERT INTO rotations (category, bucket, name, image, can_be_shiny, details, start_utc, end_utc, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // La source peut publier deux fois le même (bucket, nom) — la contrainte
  // UNIQUE l'interdit : on garde la première occurrence et on ignore la suivante.
  const seen = new Set();
  for (const it of items) {
    const key = `${it.bucket ?? ''}\u0000${it.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stmt.run(
      category, it.bucket ?? '', it.name, it.image ?? null, toSql(Boolean(it.canBeShiny)),
      it.details ? JSON.stringify(it.details) : null,
      isoOrNull(it.startUtc),
      isoOrNull(it.endUtc),
      now,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Cache de géocodage (CDC 4.5 – « chaque lieu n'est géocodé qu'une fois ») */
/* ------------------------------------------------------------------ */

export function getGeocache(query) {
  const row = getDb().prepare('SELECT * FROM geocache WHERE query = ?').get(query);
  return row || null;
}

export function setGeocache(query, { displayName, latitude, longitude, timezone }) {
  getDb().prepare(`
    INSERT INTO geocache (query, display_name, latitude, longitude, timezone, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(query) DO UPDATE SET
      display_name = excluded.display_name, latitude = excluded.latitude,
      longitude = excluded.longitude, timezone = excluded.timezone, fetched_at = excluded.fetched_at
  `).run(query, displayName ?? null, latitude ?? null, longitude ?? null, timezone ?? null, new Date().toISOString());
}

/* ------------------------------------------------------------------ */
/* Maintenance (CDC 6 – stockage limité)                               */
/* ------------------------------------------------------------------ */

/** Purge les événements terminés depuis plus de `days` jours et leurs notifications. */
export function purgeOld(days = 30) {
  const db = getDb();
  const limit = new Date(Date.now() - days * 86400000).toISOString();
  const ev = db.prepare('DELETE FROM events WHERE end_utc IS NOT NULL AND end_utc < ?').run(limit);
  const notif = db.prepare(`
    DELETE FROM notifications
    WHERE target_id IN (SELECT id FROM events WHERE end_utc IS NOT NULL AND end_utc < ?)
  `).run(limit);
  if (ev.changes || notif.changes) {
    log.info(`Purge : ${ev.changes} événement(s), ${notif.changes} notification(s) supprimé(s).`);
  }
  return { events: ev.changes, notifications: notif.changes };
}

/** Statistiques rapides (utilisées par /ping et les logs de démarrage). */
export function stats() {
  const db = getDb();
  const one = (sql) => Object.values(db.prepare(sql).get() ?? { n: 0 })[0] ?? 0;
  return {
    events: one('SELECT COUNT(*) AS n FROM events'),
    guilds: one('SELECT COUNT(*) AS n FROM guild_config'),
    notifications: one('SELECT COUNT(*) AS n FROM notifications'),
    rotations: one('SELECT COUNT(*) AS n FROM rotations'),
  };
}

/** Types d'événements réellement présents en base (pour /setup types). */
export function distinctTypes() {
  return getDb().prepare('SELECT DISTINCT type FROM events').all().map((r) => r.type);
}
