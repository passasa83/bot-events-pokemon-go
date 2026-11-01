/**
 * Source primaire : ScrapedDuck (bigfoott/ScrapedDuck), qui scrappe LeekDuck.com
 * et publie les données en JSON sur la branche `data`.
 *
 * Formats constatés le 1er novembre 2026 (voir README, section « Source de données ») :
 *  - `events.json` : tableau d'événements
 *      { eventID, name, eventType, heading, link, image, start, end, extraData }
 *      `start`/`end` : "2026-10-31T14:00:00.000" (heure locale du joueur)
 *                      ou "2026-11-03T21:00:00.000Z" (UTC)
 *  - `raids.json`   : tableau de boss { name, tier, image, canBeShiny, types[], combatPower }
 *  - `eggs.json`    : tableau d'œufs  { name, eggType, image, canBeShiny, rarity }
 *
 * La source ne fournit PAS de coordonnées GPS ni de fuseau horaire :
 * le géocodage (CDC 4.5) s'applique donc aux lieux déclarés via
 * `data/places.json` ou corrigés avec `/admin location`.
 */

import log from '../logger.js';
import { parseSourceDate, zonedTimeToUtc, DEFAULT_TZ } from '../time.js';
import { dedupeKeyFor, contentHash, truncate } from '../util.js';

export const label = 'LeekDuck (ScrapedDuck)';

/** GET JSON avec timeout et contrôle d'erreur. */
async function getJson(url, userAgent) {
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`JSON invalide : ${url}`); }
}

/* ------------------------------------------------------------------ */
/* Événements                                                          */
/* ------------------------------------------------------------------ */

/** Construit une description courte à partir des données complémentaires. */
function buildDescription(raw) {
  const extra = raw.extraData || {};
  if (extra.spotlight?.bonus) return truncate(`${extra.spotlight.name} — ${extra.spotlight.bonus}`, 300);
  if (extra.communityday?.bonuses?.length) {
    const list = extra.communityday.bonuses.slice(0, 3).map((b) => b.text).join(' · ');
    return truncate(list, 300);
  }
  if (extra.raidbattles?.bosses?.length) {
    return truncate(`Boss : ${extra.raidbattles.bosses.map((b) => b.name).join(', ')}`, 300);
  }
  if (extra.generic?.hasSpawns) return 'Apparitions augmentées pendant l’événement.';
  return null;
}

/** Détails conservés pour les commandes `/events` et les rotations. */
function buildDetails(raw) {
  const extra = raw.extraData || {};
  const details = {};
  if (extra.spotlight) {
    details.spotlight = {
      name: extra.spotlight.name,
      bonus: extra.spotlight.bonus ?? null,
      image: extra.spotlight.image ?? null,
      canBeShiny: Boolean(extra.spotlight.canBeShiny),
      list: (extra.spotlight.list || []).map((p) => ({ name: p.name, canBeShiny: Boolean(p.canBeShiny), image: p.image })),
    };
  }
  if (extra.communityday) {
    details.communityday = {
      spawns: (extra.communityday.spawns || []).map((p) => ({ name: p.name, image: p.image })),
      bonuses: (extra.communityday.bonuses || []).map((b) => b.text),
      shinies: (extra.communityday.shinies || []).map((p) => p.name),
    };
  }
  if (extra.raidbattles) {
    details.raidbattles = {
      bosses: (extra.raidbattles.bosses || []).map((b) => ({ name: b.name, image: b.image, canBeShiny: Boolean(b.canBeShiny) })),
      shinies: (extra.raidbattles.shinies || []).map((p) => p.name),
    };
  }
  if (extra.generic) details.generic = extra.generic;
  return Object.keys(details).length ? details : null;
}

/** Normalise un événement brut au format interne. */
export function normalizeEvent(raw) {
  const start = parseSourceDate(raw.start);
  const end = parseSourceDate(raw.end);
  // Un seul mode d’heure par événement : on suit celui du début.
  const timeMode = start.timeMode;
  const toUtc = (parsed) => {
    if (parsed.date) return parsed.date;
    if (!parsed.raw) return null;
    // Une date porteuse de fuseau reste interprétée telle quelle.
    if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(parsed.raw)) {
      const d = new Date(parsed.raw);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return zonedTimeToUtc(parsed.raw, DEFAULT_TZ);
  };

  return {
    // Sans identifiant stable côté source, la clé titre+date sert d'identifiant :
    // deux raids homonymes à deux dates doivent coexister en base.
    id: raw.eventID ? String(raw.eventID) : dedupeKeyFor(raw.name, raw.start),
    dedupeKey: dedupeKeyFor(raw.name, raw.start),
    title: String(raw.name || 'Événement sans titre'),
    type: String(raw.eventType || 'event'),
    heading: raw.heading || null,
    timeMode,
    startUtc: toUtc(start),
    endUtc: end.raw ? toUtc(end) : null,
    startRaw: start.raw,
    endRaw: end.raw,
    image: raw.image || null,
    link: raw.link || null,
    description: buildDescription(raw),
    details: buildDetails(raw),
    placeName: null,
    latitude: null,
    longitude: null,
    timezone: null,
  };
}

/* ------------------------------------------------------------------ */
/* Rotations : raids, œufs, vedettes                                   */
/* ------------------------------------------------------------------ */

const TIER_ORDER = ['1-star', '2-star', '3-star', '4-star', '5-star', 'mega', 'max', 'legendary', 'mythical', 'shadow', 'other'];

/** Clé de tri des paliers de raid : 1★ puis 3★ puis 5★ puis Méga, etc. */
function tierSortKey(tier) {
  const s = String(tier).toLowerCase();
  const star = s.match(/(\d)\s*-?\s*star/);
  if (star) return TIER_ORDER.indexOf(`${star[1]}-star`);
  if (s.includes('super mega')) return 90;
  if (s.includes('mega')) return 91;
  if (s.includes('max')) return 92;
  if (s.includes('shadow')) return 93;
  if (s.includes('legend')) return 94;
  return 99;
}

export function normalizeRaids(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({
      bucket: String(r.tier || 'Autre'),
      name: String(r.name),
      image: r.image || null,
      canBeShiny: Boolean(r.canBeShiny),
      details: {
        types: (r.types || []).map((t) => t.name),
        cp: r.combatPower || null,
      },
      startUtc: null,
      endUtc: null,
    }))
    .sort((a, b) => tierSortKey(a.bucket) - tierSortKey(b.bucket) || a.name.localeCompare(b.name));
}

export function normalizeEggs(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => ({
      bucket: String(e.eggType || 'Autre'),
      name: String(e.name),
      image: e.image || null,
      canBeShiny: Boolean(e.canBeShiny),
      details: {
        rarity: e.rarity ?? null,
        adventureSync: Boolean(e.isAdventureSync),
        regional: Boolean(e.isRegional),
        gift: Boolean(e.isGiftExchange),
      },
      startUtc: null,
      endUtc: null,
    }))
    .sort((a, b) => (parseInt(a.bucket, 10) || 99) - (parseInt(b.bucket, 10) || 99) || a.name.localeCompare(b.name));
}

/**
 * Pokémon vedettes : Pokémon mis en avant par les événements actifs
 * (Spotlight Hour, Community Day, apparitions augmentées).
 * @param {Array} events événements normalisés
 * @param {Date} now instant de référence
 */
export function buildVedettes(events, now = new Date()) {
  const items = [];
  for (const ev of events) {
    const active = (!ev.startUtc || ev.startUtc <= now) && (!ev.endUtc || ev.endUtc >= now);
    if (!active) continue;
    const sp = ev.details?.spotlight;
    if (sp) {
      items.push({
        bucket: 'Spotlight Hour',
        name: sp.name,
        image: sp.image,
        canBeShiny: sp.canBeShiny,
        details: { bonus: sp.bonus, eventId: ev.id, eventTitle: ev.title },
        startUtc: ev.startUtc,
        endUtc: ev.endUtc,
      });
      continue;
    }
    const cd = ev.details?.communityday;
    if (cd?.spawns?.length) {
      for (const p of cd.spawns) {
        items.push({
          bucket: 'Community Day',
          name: p.name,
          image: p.image,
          canBeShiny: cd.shinies.includes(p.name),
          details: { bonus: cd.bonuses[0] ?? null, eventId: ev.id, eventTitle: ev.title },
          startUtc: ev.startUtc,
          endUtc: ev.endUtc,
        });
      }
    }
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* Collecte complète                                                   */
/* ------------------------------------------------------------------ */

/**
 * Interroge la source et renvoie les données normalisées.
 * Les raids et les œufs sont optionnels : leur échec n'annule pas les événements.
 * @returns {Promise<{events:Array, raids:Array|null, eggs:Array|null, source:string}>}
 */
export async function collect(cfg) {
  const base = cfg.source.base.replace(/\/$/, '');
  const ua = cfg.source.userAgent;

  const eventsRaw = await getJson(`${base}/${cfg.source.eventsFile}`, ua);
  if (!Array.isArray(eventsRaw)) throw new Error('events.json : format inattendu (tableau attendu)');

  let raids = null;
  let eggs = null;
  try {
    raids = normalizeRaids(await getJson(`${base}/${cfg.source.raidsFile}`, ua));
  } catch (err) {
    log.warn(`Raids indisponibles (${label}) : ${err.message}`);
  }
  try {
    eggs = normalizeEggs(await getJson(`${base}/${cfg.source.eggsFile}`, ua));
  } catch (err) {
    log.warn(`Œufs indisponibles (${label}) : ${err.message}`);
  }

  return {
    events: eventsRaw.map(normalizeEvent).filter((e) => e.title),
    raids,
    eggs,
    source: label,
    hash: contentHash(eventsRaw.map((e) => [e.eventID, e.name, e.start, e.end])),
  };
}
