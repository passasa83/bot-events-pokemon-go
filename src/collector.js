/**
 * Module de collecte (CDC 5.4 – étape 1).
 *
 *  1. Interroge la source primaire (ScrapedDuck / LeekDuck).
 *  2. Si elle échoue, bascule sur la source de secours (leak-duck).
 *  3. Applique les lieux déclarés localement (`data/places.json`).
 *  4. Géocode, de façon bornée, les lieux encore inconnus.
 *  5. Persiste en SQLite en mémorisant les événements déjà notifiés.
 */

import { existsSync, readFileSync } from 'node:fs';
import config from './config.js';
import log from './logger.js';
import * as primary from './sources/leekduck.js';
import * as secondary from './sources/leakduck.js';
import { attachCoordinates } from './geo.js';
import { upsertEvent } from './store.js';
import { contentHash } from './util.js';

/** Nombre maximal de géocodages par cycle : protège la RAM et la bande passante. */
const MAX_GEOCODE_PER_CYCLE = 4;

let placesCache = null;
let placesLoadedAt = 0;

/** Lieux déclarés par le propriétaire du bot : `{ "<id-ou-slug>": "Paris, France" }` ou objet. */
function loadPlaces() {
  const now = Date.now();
  if (placesCache && now - placesLoadedAt < 60_000) return placesCache;
  placesLoadedAt = now;
  placesCache = {};
  const file = config.placesFile;
  if (!file || !existsSync(file)) return placesCache;
  try {
    placesCache = JSON.parse(readFileSync(file, 'utf8')) || {};
    log.debug(`places.json chargé : ${Object.keys(placesCache).length} lieu(x).`);
  } catch (err) {
    log.warn(`places.json illisible : ${err.message}`);
    placesCache = {};
  }
  return placesCache;
}

/** Assure la présence d'un objet `details` (les deux sources peuvent en manquer). */
function withDetails(ev) {
  if (!ev.details) ev.details = null;
  return ev;
}

/**
 * Récupère et normalise les événements (jamais d'exception propagée).
 * @returns {Promise<{events:Array, raids:Array|null, eggs:Array|null, source:string}|null>}
 */
export async function fetchEvents() {
  let data = null;
  try {
    data = await primary.collect(config);
    log.debug(`Source primaire OK : ${data.events.length} événement(s).`);
  } catch (err) {
    log.warn(`Source primaire indisponible (${err.message}) → tentative de secours…`);
    try {
      data = await secondary.collect(config);
      log.info(`Source de secours utilisée : ${data.events.length} événement(s).`);
    } catch (err2) {
      log.error(`Sources de données indisponibles : ${err2.message}`);
      return null;
    }
  }

  const places = loadPlaces();
  let geocodeBudget = MAX_GEOCODE_PER_CYCLE;

  for (const ev of data.events) {
    withDetails(ev);
    // 1. Lieu déclaré localement (places.json) : nom, puis coordonnées si fournies.
    const declared = places[ev.id] ?? places[ev.dedupeKey];
    if (declared) {
      if (typeof declared === 'string') {
        if (!ev.placeName) ev.placeName = declared;
      } else {
        ev.placeName = declared.name ?? ev.placeName;
        ev.latitude = declared.lat ?? declared.latitude ?? ev.latitude;
        ev.longitude = declared.lon ?? declared.lng ?? declared.longitude ?? ev.longitude;
        ev.timezone = declared.tz ?? declared.timezone ?? ev.timezone;
      }
    }
    // 2. Géocodage (une seule fois par lieu, puis mis en cache en base).
    if (ev.placeName && ev.latitude == null && geocodeBudget > 0 && config.geocode.enabled) {
      geocodeBudget -= 1;
      await attachCoordinates(ev);
    } else if (ev.placeName && ev.latitude == null) {
      log.debug(`Géocodage reporté (budget épuisé) : ${ev.placeName}`);
    }
  }

  return data;
}

/**
 * Enregistre les événements en base et renvoie ceux qui sont neufs
 * (donc à annoncer dans les serveurs configurés).
 */
export function persistEvents(events) {
  const fresh = [];
  for (const ev of events) {
    try {
      const res = upsertEvent(ev, contentHash([
        ev.title, ev.type, ev.startRaw, ev.endRaw, ev.image, ev.link,
        ev.description, JSON.stringify(ev.details ?? null),
        ev.placeName, ev.latitude, ev.longitude, ev.timezone,
      ]));
      if (res.isNew) fresh.push({ ...ev, id: res.id });
    } catch (err) {
      log.exception(`Échec d'enregistrement de l'événement « ${ev.title} »`, err);
    }
  }
  return fresh;
}

/** Cycle complet : collecte + persistance. */
export async function syncEvents() {
  const data = await fetchEvents();
  if (!data) return null;
  const fresh = persistEvents(data.events);
  log.info(`Collecte : ${data.events.length} événement(s), ${fresh.length} nouveau(x) (${data.source}).`);
  return { ...data, fresh };
}
