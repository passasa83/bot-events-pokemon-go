/**
 * Gestion des dates et des fuseaux horaires (CDC 4.6).
 *
 * Principe :
 *  - « absolute » : la source fournit un horodatage UTC (suffixe Z) → on affiche
 *    l'heure du lieu (si connu), l'heure française et le décalage.
 *  - « local »    : l'événement se déroule « à l'heure locale du joueur »
 *    (Community Day 14 h–17 h partout) → on affiche l'heure telle quelle,
 *    SANS conversion, sauf pour la planification des notifications où on
 *    interprète l'heure dans le fuseau du bot (Europe/Paris par défaut).
 *
 * Aucune dépendance externe : uniquement l'API Intl native de Node.js
 * (exigence « sans dépendance lourde » du CDC 5.1).
 */

import config from './config.js';

/* ------------------------------------------------------------------ */
/* Parsing des dates de la source                                      */
/* ------------------------------------------------------------------ */

/**
 * Analyse une date issue de la source.
 * @returns {{timeMode:'absolute'|'local', raw:string, date:Date|null}}
 */
export function parseSourceDate(value) {
  if (!value) return { timeMode: 'local', raw: null, date: null };
  const raw = String(value).trim();
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return { timeMode: 'absolute', raw, date: Number.isNaN(d.getTime()) ? null : d };
  }
  // Pas de fuseau explicite → heure locale du joueur.
  return { timeMode: 'local', raw, date: null };
}

/* ------------------------------------------------------------------ */
/* Fuseaux horaires                                                    */
/* ------------------------------------------------------------------ */

const partsFmtCache = new Map();

function formatterFor(timeZone) {
  let f = partsFmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    partsFmtCache.set(timeZone, f);
  }
  return f;
}

/** Décalage (en minutes) du fuseau `timeZone` par rapport à UTC, à une date donnée. */
export function offsetMinutes(date, timeZone) {
  const parts = formatterFor(timeZone).formatToParts(date);
  const map = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  const asUtc = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour % 24, +map.minute, +map.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Décalage entre deux fuseaux, à une date donnée (tient compte de l'heure d'été). */
export function zoneDeltaMinutes(date, fromZone, toZone) {
  return offsetMinutes(date, toZone) - offsetMinutes(date, fromZone);
}

/** Formate un décalage en heures : "+6 h", "+5 h 30", "−4 h". */
export function deltaLabel(minutes) {
  if (!minutes) return '±0 h';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m ? `${sign}${h} h ${String(m).padStart(2, '0')}` : `${sign}${h} h`;
}

/** Heure locale (HH:MM) d'une date UTC dans un fuseau. */
export function clockInZone(date, timeZone, locale = 'fr-FR') {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

/** Date courte + heure dans un fuseau : « 31 oct. 14:00 ». */
export function dateTimeInZone(date, timeZone, locale = 'fr-FR') {
  return new Intl.DateTimeFormat(locale, {
    timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

/** Interprète une heure « locale » brute (2026-11-21T14:00:00) dans un fuseau IANA. */
export function zonedTimeToUtc(raw, timeZone) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  // Deux passes pour stabiliser le résultat autour des changements d'heure.
  let guess = new Date(asUtc - offsetMinutes(new Date(asUtc), timeZone) * 60000);
  guess = new Date(asUtc - offsetMinutes(guess, timeZone) * 60000);
  return guess;
}

/** "2026-11-21T14:00:00" → "14h00" (affichage heure locale, sans conversion). */
export function rawClock(raw, locale = 'fr-FR') {
  const m = String(raw ?? '').match(/T(\d{2}):(\d{2})/);
  if (!m) return raw ?? '—';
  const sep = locale.startsWith('fr') ? 'h' : ':';
  return `${m[1]}${sep}${m[2]}`;
}

/** Date courte + heure issues d'une chaîne brute : « 21 nov. 14h00 ». */
export function rawDateTime(raw, locale = 'fr-FR') {
  const m = String(raw ?? '').match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return rawClock(raw, locale);
  // Construction en UTC pour éviter tout décalage lié au fuseau du serveur.
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC', day: 'numeric', month: 'short',
  }).format(d);
  return `${date} ${rawClock(raw, locale)}`;
}

/**
 * Plage horaire « 14h00 – 17h00 » si c'est le même jour,
 * sinon « 8 sept. 10h00 → 1 déc. 10h00 » (événements multi-jours).
 */
export function rawRange(startRaw, endRaw, locale = 'fr-FR') {
  const dayOf = (raw) => String(raw ?? '').slice(0, 10);
  if (!endRaw || dayOf(startRaw) === dayOf(endRaw)) {
    return `${rawClock(startRaw, locale)} – ${rawClock(endRaw, locale)}`;
  }
  return `${rawDateTime(startRaw, locale)} → ${rawDateTime(endRaw, locale)}`;
}

/* ------------------------------------------------------------------ */
/* Horodatages Discord                                                */
/* ------------------------------------------------------------------ */

/** Horodatage Discord dynamique : chaque lecteur le voit dans son propre fuseau. */
export function discordTimestamp(date, style = 'F') {
  if (!date || Number.isNaN(date.getTime())) return '—';
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

/* ------------------------------------------------------------------ */
/* Fuseau d'un lieu localisé (CDC 4.6)                                 */
/* ------------------------------------------------------------------ */

/**
 * Villes de référence : permettent de déduire un fuseau IANA précis à partir de
 * coordonnées GPS sans embarquer la base `geo-tz` (trop lourde pour 512 Mo de RAM).
 * Si la distance dépasse `MAX_KM`, on retombe sur une estimation par longitude.
 */
const CITIES = [
  // Europe
  ['Paris', 48.8566, 2.3522, 'Europe/Paris'],
  ['Lyon', 45.764, 4.8357, 'Europe/Paris'],
  ['Marseille', 43.2965, 5.3698, 'Europe/Paris'],
  ['Bordeaux', 44.8378, -0.5792, 'Europe/Paris'],
  ['Lille', 50.6292, 3.0573, 'Europe/Paris'],
  ['Strasbourg', 48.5734, 7.7521, 'Europe/Paris'],
  ['Bruxelles', 50.8503, 4.3517, 'Europe/Brussels'],
  ['Amsterdam', 52.3676, 4.9041, 'Europe/Amsterdam'],
  ['Berlin', 52.52, 13.405, 'Europe/Berlin'],
  ['Francfort', 50.1109, 8.6821, 'Europe/Berlin'],
  ['Munich', 48.1351, 11.582, 'Europe/Berlin'],
  ['Madrid', 40.4168, -3.7038, 'Europe/Madrid'],
  ['Barcelone', 41.3874, 2.1686, 'Europe/Madrid'],
  ['Lisbonne', 38.7223, -9.1393, 'Europe/Lisbon'],
  ['Rome', 41.9028, 12.4964, 'Europe/Rome'],
  ['Milan', 45.4642, 9.19, 'Europe/Rome'],
  ['Zurich', 47.3769, 8.5417, 'Europe/Zurich'],
  ['Vienne', 48.2082, 16.3738, 'Europe/Vienna'],
  ['Prague', 50.0755, 14.4378, 'Europe/Prague'],
  ['Varsovie', 52.2297, 21.0122, 'Europe/Warsaw'],
  ['Budapest', 47.4979, 19.0402, 'Europe/Budapest'],
  ['Stockholm', 59.3293, 18.0686, 'Europe/Stockholm'],
  ['Oslo', 59.9139, 10.7522, 'Europe/Oslo'],
  ['Copenhague', 55.6761, 12.5683, 'Europe/Copenhagen'],
  ['Londres', 51.5074, -0.1278, 'Europe/London'],
  ['Dublin', 53.3498, -6.2603, 'Europe/Dublin'],
  ['Athènes', 37.9838, 23.7275, 'Europe/Athens'],
  ['Bucarest', 44.4268, 26.1025, 'Europe/Bucharest'],
  ['Kyiv', 50.4501, 30.5234, 'Europe/Kyiv'],
  ['Istanbul', 41.0082, 28.9784, 'Europe/Istanbul'],
  ['Moscou', 55.7558, 37.6173, 'Europe/Moscow'],
  // Afrique
  ['Le Caire', 30.0444, 31.2357, 'Africa/Cairo'],
  ['Casablanca', 33.5731, -7.5898, 'Africa/Casablanca'],
  ['Dakar', 14.7167, -17.4677, 'Africa/Dakar'],
  ['Le Cap', -33.9249, 18.4241, 'Africa/Johannesburg'],
  ['Lagos', 6.5244, 3.3792, 'Africa/Lagos'],
  // Amériques
  ['New York', 40.7128, -74.006, 'America/New_York'],
  ['Boston', 42.3601, -71.0589, 'America/New_York'],
  ['Washington', 38.9072, -77.0369, 'America/New_York'],
  ['Atlanta', 33.749, -84.388, 'America/New_York'],
  ['Miami', 25.7617, -80.1918, 'America/New_York'],
  ['Toronto', 43.6532, -79.3832, 'America/Toronto'],
  ['Montréal', 45.5019, -73.5674, 'America/Toronto'],
  ['Chicago', 41.8781, -87.6298, 'America/Chicago'],
  ['Mexico', 19.4326, -99.1332, 'America/Mexico_City'],
  ['Dallas', 32.7767, -96.797, 'America/Chicago'],
  ['Denver', 39.7392, -104.9903, 'America/Denver'],
  ['Phoenix', 33.4484, -112.074, 'America/Phoenix'],
  ['Los Angeles', 34.0522, -118.2437, 'America/Los_Angeles'],
  ['San Diego', 32.7157, -117.1611, 'America/Los_Angeles'],
  ['San Francisco', 37.7749, -122.4194, 'America/Los_Angeles'],
  ['Seattle', 47.6062, -122.3321, 'America/Los_Angeles'],
  ['Honolulu', 21.3069, -157.8583, 'Pacific/Honolulu'],
  ['Bogota', 4.711, -74.0721, 'America/Bogota'],
  ['Lima', -12.0464, -77.0428, 'America/Lima'],
  ['Santiago', -33.4489, -70.6693, 'America/Santiago'],
  ['Buenos Aires', -34.6037, -58.3816, 'America/Argentina/Buenos_Aires'],
  ['São Paulo', -23.5505, -46.6333, 'America/Sao_Paulo'],
  // Asie / Océanie
  ['Dubaï', 25.2048, 55.2708, 'Asia/Dubai'],
  ['Téhéran', 35.6892, 51.389, 'Asia/Tehran'],
  ['Riyad', 24.7136, 46.6753, 'Asia/Riyadh'],
  ['Mumbai', 19.076, 72.8777, 'Asia/Kolkata'],
  ['Delhi', 28.6139, 77.209, 'Asia/Kolkata'],
  ['Bangkok', 13.7563, 100.5018, 'Asia/Bangkok'],
  ['Jakarta', -6.2088, 106.8456, 'Asia/Jakarta'],
  ['Singapour', 1.3521, 103.8198, 'Asia/Singapore'],
  ['Kuala Lumpur', 3.139, 101.6869, 'Asia/Kuala_Lumpur'],
  ['Manille', 14.5995, 120.9842, 'Asia/Manila'],
  ['Hong Kong', 22.3193, 114.1694, 'Asia/Hong_Kong'],
  ['Shanghai', 31.2304, 121.4737, 'Asia/Shanghai'],
  ['Pékin', 39.9042, 116.4074, 'Asia/Shanghai'],
  ['Séoul', 37.5665, 126.978, 'Asia/Seoul'],
  ['Tokyo', 35.6762, 139.6503, 'Asia/Tokyo'],
  ['Osaka', 34.6937, 135.5023, 'Asia/Tokyo'],
  ['Sydney', -33.8688, 151.2093, 'Australia/Sydney'],
  ['Melbourne', -37.8136, 144.9631, 'Australia/Melbourne'],
  ['Brisbane', -27.4698, 153.0251, 'Australia/Brisbane'],
  ['Perth', -31.9505, 115.8605, 'Australia/Perth'],
  ['Auckland', -36.8485, 174.7633, 'Pacific/Auckland'],
];

const R_EARTH_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;

function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(a));
}

const MAX_CITY_DISTANCE_KM = 400;

/**
 * Déduit un fuseau IANA de coordonnées GPS, sans dépendance externe :
 *  1. ville de référence la plus proche (< 400 km) → fuseau précis ;
 *  2. sinon estimation grossière par longitude (Etc/GMT±N), sans heure d'été.
 * Un fuseau exact peut toujours être imposé via /admin location.
 */
export function timezoneFromCoords(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null;
  let bestDist = Infinity;
  for (const [name, clat, clon, tz] of CITIES) {
    const d = haversine(lat, lon, clat, clon);
    if (d < bestDist) { bestDist = d; best = { name, tz }; }
  }
  if (best && bestDist <= MAX_CITY_DISTANCE_KM) return best.tz;
  // Estimation par longitude (signe inversé dans la convention Etc/GMT).
  const hours = Math.round(lon / 15);
  if (hours === 0) return 'UTC';
  const sign = hours > 0 ? '-' : '+';
  return `Etc/GMT${sign}${Math.abs(hours)}`;
}

/** Nom du fuseau lisible : "Europe/Paris" → "heure de Paris". */
export function zoneLabel(timeZone, locale = 'fr-FR') {
  if (!timeZone) return '';
  const city = timeZone.split('/').pop().replace(/_/g, ' ');
  return city;
}

/** Fuseau par défaut du bot (heure française, CDC 4.6). */
export const DEFAULT_TZ = config.defaultTimezone;
