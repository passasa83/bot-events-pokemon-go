/**
 * Géocodage des lieux d'événements (CDC 4.5).
 *
 * Source : OpenStreetMap Nominatim (gratuit).
 *  - 1 requête par seconde maximum (politique d'usage) : la file d'attente
 *    ci-dessous impose un intervalle minimal entre deux appels.
 *  - User-Agent identifiable et configurable (requis par Nominatim).
 *  - Chaque requête réussie ou échouée est mise en cache dans SQLite :
 *    un lieu n'est géocodé qu'une seule fois, jamais deux.
 *  - Échec → `null` : la notification part quand même, sans coordonnées,
 *    et l'incident est journalisé (exigence 4.5).
 */

import config from './config.js';
import log from './logger.js';
import { getGeocache, setGeocache } from './store.js';
import { timezoneFromCoords } from './time.js';

/* File d'attente : garantit l'intervalle minimal entre deux requêtes. */
let lastCallAt = 0;
let queue = Promise.resolve();

function throttle() {
  queue = queue.then(async () => {
    const wait = lastCallAt + config.geocode.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  });
  return queue;
}

/**
 * Géocode un nom de lieu ou une adresse.
 * @param {string} query ex. "Parc des Princes, Paris"
 * @returns {Promise<{displayName:string, latitude:number, longitude:number, timezone:string}|null>}
 */
export async function geocode(query) {
  const key = String(query || '').trim().toLowerCase();
  if (!key) return null;

  // 1. Cache SQLite : jamais deux fois la même requête.
  const cached = getGeocache(key);
  if (cached && cached.latitude != null) {
    return {
      displayName: cached.display_name,
      latitude: cached.latitude,
      longitude: cached.longitude,
      timezone: cached.timezone || timezoneFromCoords(cached.latitude, cached.longitude),
    };
  }

  if (!config.geocode.enabled) {
    log.debug(`Géocodage désactivé : "${query}"`);
    return null;
  }

  try {
    await throttle();
    const url = new URL(config.geocode.endpoint);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('q', query);

    const res = await fetch(url, {
      headers: { 'User-Agent': config.geocode.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(config.geocode.timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const first = Array.isArray(rows) ? rows[0] : null;
    if (!first) {
      // Résultat introuvable : on le mémorise aussi pour ne pas réessayer à chaque cycle.
      setGeocache(key, { displayName: null, latitude: null, longitude: null, timezone: null });
      log.warn(`Géocodage sans résultat : "${query}"`);
      return null;
    }
    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    const timezone = timezoneFromCoords(latitude, longitude);
    setGeocache(key, { displayName: first.display_name, latitude, longitude, timezone });
    log.debug(`Géocodé "${query}" → ${latitude}, ${longitude} (${timezone})`);
    return { displayName: first.display_name, latitude, longitude, timezone };
  } catch (err) {
    // Échec : on journalise et on renvoie null → notification sans coordonnées.
    log.warn(`Échec de géocodage pour "${query}" : ${err.message}`);
    return null;
  }
}

/**
 * Applique le géocodage à un événement localisé, si la source n'a pas fourni
 * de coordonnées. Ne lève jamais d'exception (dégradation gracieuse).
 */
export async function attachCoordinates(event) {
  if (event.latitude != null && event.longitude != null) {
    if (!event.timezone) event.timezone = timezoneFromCoords(event.latitude, event.longitude);
    return event;
  }
  if (!event.placeName) return event;
  const geo = await geocode(event.placeName);
  if (geo) {
    event.placeName = geo.displayName || event.placeName;
    event.latitude = geo.latitude;
    event.longitude = geo.longitude;
    event.timezone = geo.timezone;
  }
  return event;
}
