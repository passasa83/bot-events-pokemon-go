/**
 * Configuration du bot – lecture des variables d'environnement.
 *
 * Toutes les valeurs sont surchargeables via `.env` (voir `.env.example`).
 * Aucun secret n'est écrit dans le code : le token provient uniquement
 * de la variable d'environnement `DISCORD_TOKEN` (exigence de sécurité du CDC).
 */

// Chargement optionnel de `.env` si le fichier existe (utile en local).
// Sur Wispbyte, les variables sont renseignées dans le panel : on ne fait rien.
try {
  const { existsSync, readFileSync } = await import('node:fs');
  if (existsSync('.env')) {
    for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // .env absent : on s'appuie uniquement sur l'environnement du système.
}

const int = (v, def) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : def;
};

const bool = (v, def) => {
  if (v === undefined || v === '') return def;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'oui';
};

export const config = {
  // --- Discord ---
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  testGuildId: process.env.TEST_GUILD_ID || null,
  ownerId: process.env.BOT_OWNER_ID || null,

  // --- Source de données ---
  source: {
    base: process.env.EVENTS_SOURCE_URL || 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data',
    fallbackBase: process.env.EVENTS_SOURCE_FALLBACK_URL || 'https://raw.githubusercontent.com/pokelitee/leak-duck/data',
    eventsFile: process.env.EVENTS_FILE || 'events.json',
    raidsFile: process.env.RAIDS_FILE || 'raids.json',
    eggsFile: process.env.EGGS_FILE || 'eggs.json',
    timeoutMs: 20_000,
    userAgent: 'BotEventsPokemonGO/1.0 (https://github.com/; bot Discord Pokémon GO)',
  },

  // --- Planification ---
  pollIntervalMinutes: Math.min(Math.max(int(process.env.POLL_INTERVAL, 30), 5), 240),
  reminderMinutes: int(process.env.REMINDER_MINUTES, 60),
  /** Fenêtre de rattrapage après redémarrage pour le message « commence maintenant ». */
  startCatchUpMinutes: 30,

  // --- Localisation / fuseaux ---
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Europe/Paris',

  // --- Géocodage ---
  geocode: {
    enabled: bool(process.env.GEOCODE_ENABLED, true),
    userAgent: process.env.NOMINATIM_USER_AGENT || 'BotEventsPokemonGO/1.0',
    endpoint: 'https://nominatim.openstreetmap.org/search',
    minIntervalMs: 1200, // politique Nominatim : 1 requête par seconde
    timeoutMs: 10_000,
  },
  /** Fichier facultatif de lieux déclarés par le propriétaire (`data/places.json`). */
  placesFile: process.env.PLACES_FILE || './data/places.json',

  // --- Divers ---
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  dbPath: process.env.DB_PATH || './data/bot.db',
  /** Purge des événements terminés depuis plus de N jours (contrainte de stockage). */
  purgeAfterDays: 30,
};

/** Contrôles de démarrage : échec net et lisible si une variable requise manque. */
export function validateConfig() {
  const problems = [];
  if (!config.token) problems.push('DISCORD_TOKEN manquant');
  if (!config.clientId) problems.push('DISCORD_CLIENT_ID manquant');
  return problems;
}

export default config;
