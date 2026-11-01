/**
 * Source de secours : leak-duck (pokelitee/leak-duck), également dérivée de
 * LeekDuck.com mais publiée par un autre projet, avec un format différent.
 * Elle est utilisée uniquement si la source primaire est indisponible
 * (obligation du CDC 4.1 : « une source de secours devra être prévue »).
 *
 * Formats constatés le 1er novembre 2026 :
 *  - `events.json`  : objet { "Community Day": [ { title, article_url, banner_url,
 *                      category, details, is_local_time, start_time, end_time, description } ] }
 *  - `raid_bosses.json` : objet { "5-Star Raids": [ { name, shiny_available, asset_url, tier, cp_range, types } ] }
 *  - `egg_pool.json`    : objet { "2 km Eggs": [ { name, shiny_available, asset_url, hatch_distance, rarity_tier } ] }
 *
 * Les identifiants n'existent pas : on dérive un slug du titre, ce qui reste
 * compatible avec la source primaire grâce à la clé de déduplication du titre.
 */

import log from '../logger.js';
import { zonedTimeToUtc, DEFAULT_TZ } from '../time.js';
import { dedupeKeyFor, truncate } from '../util.js';

export const label = 'leak-duck (secours)';

/** Catégorie LeekDuck → type normalisé. */
const CATEGORY_TO_TYPE = {
  'Raid Day': 'raid-day',
  Event: 'event',
  'Max Mondays': 'max-mondays',
  'GO Pass': 'go-pass',
  'GO Battle League': 'go-battle-league',
  'Raid Battles': 'raid-battles',
  'Raid Hour': 'raid-hour',
  'Pokémon Spotlight Hour': 'pokemon-spotlight-hour',
  'Wild Area': 'wild-area',
  'Max Battles': 'max-battles',
  'Community Day': 'community-day',
  Season: 'season',
  Research: 'research',
  'Pokémon GO Tour': 'pokemon-go-tour',
};

async function getJson(url, userAgent) {
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  try { return JSON.parse(await res.text()); } catch { throw new Error(`JSON invalide : ${url}`); }
}

function normalizeEvent(category, raw) {
  const isLocal = Boolean(raw.is_local_time);
  const startRaw = raw.start_time || null;
  const endRaw = raw.end_time || null;

  const toUtc = (value, local) => {
    if (value === null || value === undefined || value === '') return null;
    // Certaines entrées sont publiées comme horizon Unix (secondes).
    if (typeof value === 'number' || /^\d{10}$/.test(String(value))) {
      const d = new Date(Number(value) * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    let d;
    if (!local) d = new Date(/[Zz]$|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
    else d = zonedTimeToUtc(value, DEFAULT_TZ);
    return d && !Number.isNaN(d.getTime()) ? d : null;
  };

  const details = {};
  if (Array.isArray(raw.details?.bonuses) && raw.details.bonuses.length) {
    details.communityday = {
      spawns: (raw.details.features || []).map((f) => ({ name: f.name, image: f.asset_url })),
      bonuses: raw.details.bonuses,
      shinies: (raw.details.shiny || []).map((s) => s.name),
    };
  }
  if (Array.isArray(raw.details?.raids) && raw.details.raids.length) {
    details.raidbattles = {
      bosses: raw.details.raids.map((r) => ({ name: r.name, image: r.asset_url, canBeShiny: Boolean(r.shiny_available) })),
    };
  }
  if (category === 'Pokémon Spotlight Hour') {
    details.spotlight = {
      name: raw.title.replace(/\s+Spotlight Hour$/i, ''),
      bonus: raw.details?.bonuses?.[0] ?? null,
      image: raw.details?.features?.[0]?.asset_url ?? raw.banner_url ?? null,
      canBeShiny: Boolean(raw.details?.features?.[0]?.shiny_available),
    };
  }

  return {
    id: dedupeKeyFor(raw.title, startRaw),
    dedupeKey: dedupeKeyFor(raw.title, startRaw),
    title: raw.title,
    type: CATEGORY_TO_TYPE[category] || 'event',
    heading: category,
    timeMode: isLocal ? 'local' : 'absolute',
    startUtc: toUtc(startRaw, isLocal),
    endUtc: toUtc(endRaw, isLocal),
    startRaw,
    endRaw,
    image: raw.banner_url || null,
    link: raw.article_url || null,
    description: raw.description ? truncate(raw.description, 300) : null,
    details: Object.keys(details).length ? details : null,
    placeName: null,
    latitude: null,
    longitude: null,
    timezone: null,
  };
}

export async function collect(cfg) {
  const base = cfg.source.fallbackBase.replace(/\/$/, '');
  const ua = cfg.source.userAgent;

  const eventsRaw = await getJson(`${base}/${cfg.source.eventsFile}`, ua);
  if (!eventsRaw || typeof eventsRaw !== 'object') throw new Error('events.json : format inattendu (objet attendu)');

  const events = [];
  for (const [category, list] of Object.entries(eventsRaw)) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) events.push(normalizeEvent(category, raw));
  }

  let raids = null;
  let eggs = null;
  try {
    const raidsRaw = await getJson(`${base}/raid_bosses.json`, ua);
    raids = Object.entries(raidsRaw || {}).flatMap(([tier, list]) =>
      (Array.isArray(list) ? list : []).map((r) => ({
        bucket: String(tier),
        name: String(r.name),
        image: r.asset_url || null,
        canBeShiny: Boolean(r.shiny_available),
        details: { types: r.types || [], cp: r.cp_range || null },
        startUtc: null,
        endUtc: null,
      })));
  } catch (err) { log.warn(`Raids indisponibles (${label}) : ${err.message}`); }

  try {
    const eggsRaw = await getJson(`${base}/egg_pool.json`, ua);
    eggs = Object.entries(eggsRaw || {}).flatMap(([dist, list]) =>
      (Array.isArray(list) ? list : []).map((e) => ({
        bucket: String(dist).replace(/\s*Eggs$/i, ''),
        name: String(e.name),
        image: e.asset_url || null,
        canBeShiny: Boolean(e.shiny_available),
        details: { rarity: e.rarity_tier ?? null },
        startUtc: null,
        endUtc: null,
      })));
  } catch (err) { log.warn(`Œufs indisponibles (${label}) : ${err.message}`); }

  return { events, raids, eggs, source: label };
}
