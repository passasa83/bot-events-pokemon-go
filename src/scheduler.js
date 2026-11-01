/**
 * Module de planification (CDC 5.4 – étape 2).
 *
 * Une tâche « tick » s'exécute chaque minute et déclenche, selon l'heure :
 *  - la collecte (toutes les POLL_INTERVAL minutes) ;
 *  - les rappels et les messages « commence maintenant » ;
 *  - la détection de changement de rotation ;
 *  - la purge quotidienne de la base (contrainte de stockage du CDC 6).
 *
 * Le gardien `busy` évite les exécutions concurrentes en cas de lenteur réseau,
 * et toutes les erreurs sont absorbées : le bot reste connecté 24 h/24
 * (critère de recette n°1).
 */

import cron from 'node-cron';
import config from './config.js';
import log from './logger.js';
import { syncEvents } from './collector.js';
import { announceEvent, announceRotation, sendEventToGuild, setSourceLabel } from './notifier.js';
import * as store from './store.js';
import { buildVedettes } from './sources/leekduck.js';
import { contentHash } from './util.js';

let client = null;
let lastPollAt = 0;
let lastPurgeAt = 0;
let busy = false;

const MINUTE = 60_000;
const DAY = 86_400_000;

/** Démarrage de la planification. */
export function startScheduler(botClient, { immediate = true, cronEnabled = true } = {}) {
  client = botClient;
  lastPollAt = 0; // force une collecte au démarrage
  lastPurgeAt = Date.now();
  if (cronEnabled) cron.schedule('* * * * *', () => tick(), { timezone: config.defaultTimezone });
  if (immediate) setTimeout(() => tick(), 5_000);
  log.info(`Planification active : collecte toutes les ${config.pollIntervalMinutes} min, vérification des rappels chaque minute.`);
}

/** Un cycle complet (exécutable à la demande, ex. /admin refresh). */
export async function tick(now = new Date()) {
  if (busy) return false;
  busy = true;
  try {
    const pollDue = now.getTime() - lastPollAt >= config.pollIntervalMinutes * MINUTE;
    if (pollDue) {
      lastPollAt = now.getTime();
      await runPoll(now);
    }
    await checkEventMoments(now);
    if (now.getTime() - lastPurgeAt > DAY) {
      lastPurgeAt = now.getTime();
      store.purgeOld(config.purgeAfterDays);
    }
    return true;
  } catch (err) {
    log.exception('Erreur dans le scheduler', err);
    return false;
  } finally {
    busy = false;
  }
}

/* ------------------------------------------------------------------ */
/* Collecte                                                            */
/* ------------------------------------------------------------------ */

async function runPoll(now) {
  // Au tout premier remplissage, on enregistre sans annoncer : sinon le bot
  // balayerait 50 événements dans chaque serveur au démarrage.
  const isFirstFill = store.stats().events === 0;

  const data = await syncEvents();
  if (!data) return; // sources indisponibles : on réessaiera au prochain cycle
  setSourceLabel(data.source);

  if (isFirstFill) {
    log.info(`Premier remplissage : ${data.events.length} événement(s) enregistré(s), aucune annonce (base vide).`);
  } else {
    for (const ev of data.fresh) await announceEvent(client, ev, 'new');
  }

  await checkRotations(data, now);
}

/* ------------------------------------------------------------------ */
/* Rotations (CDC 4.7)                                                 */
/* ------------------------------------------------------------------ */

const itemKey = (i) => `${i.bucket}::${i.name}`;
const itemsHash = (items) => contentHash(items.map(itemKey).sort());

/**
 * Compare l'état courant de chaque rotation à la base et notifie si le contenu
 * a changé. Seules les ADDITIONS déclenchent une notification : la simple
 * disparition d'un élément (fin d'une rotation) met à jour la base en silence.
 */
async function checkRotations(data, now) {
  const categories = [
    ['raids', data.raids],
    ['eggs', data.eggs],
    ['vedettes', buildVedettes(data.events, now)],
  ];

  for (const [category, items] of categories) {
    if (!Array.isArray(items)) continue;
    try {
      const hash = itemsHash(items);
      const known = store.getRotationHash(category);
      if (known === hash) continue;

      const prevKeys = new Set(store.getRotationItems(category).map(itemKey));
      const firstTime = known === null;

      store.replaceRotationItems(category, items);

      if (firstTime) {
        log.debug(`Rotation « ${category} » référencée pour la première fois (${items.length} élément(s)).`);
        store.setRotationHash(category, hash);
        continue;
      }

      const additions = items.filter((i) => !prevKeys.has(itemKey(i)));
      store.setRotationHash(category, hash);
      if (!additions.length) {
        log.debug(`Rotation « ${category} » mise à jour (uniquement des retraits).`);
        continue;
      }
      log.info(`Rotation « ${category} » changée : ${additions.length} élément(s) nouveau(x).`);
      await announceRotation(client, category, items, { source: data.source });
    } catch (err) {
      log.exception(`Erreur de rotation (${category})`, err);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Rappels et début d'événement (CDC 4.2)                              */
/* ------------------------------------------------------------------ */

async function checkEventMoments(now) {
  const guilds = [...client.guilds.cache.values()];
  if (!guilds.length) return;

  // Fenêtre utile : événements commençant dans les 26 h, ou en cours.
  const horizon = now.getTime() + 26 * 3600 * 1000;
  const candidates = store.getUpcomingEvents({ includePastDays: 0 })
    .filter((ev) => ev.startUtc && ev.startUtc.getTime() <= horizon);

  if (!candidates.length) return;

  for (const guild of guilds) {
    const cfg = store.getGuildConfig(guild.id);
    if (!cfg.channelId) continue;

    for (const ev of candidates) {
      const startMs = ev.startUtc.getTime();

      // 1. « L'événement commence maintenant » (avec rattrapage après un arrêt).
      if (now.getTime() >= startMs && now.getTime() <= startMs + config.startCatchUpMinutes * MINUTE) {
        await sendEventToGuild(guild, cfg, ev, 'start');
        continue; // pas de rappel en plus
      }
      if (now.getTime() < startMs) {
        // 2. Rappel 24 h (optionnel, /setup reminder en_24h).
        const in24h = now.getTime() >= startMs - DAY;
        if (cfg.reminder24h && in24h) {
          await sendEventToGuild(guild, cfg, ev, 'reminder24');
        }
        // 3. Rappel standard (délai configurable par serveur).
        if (cfg.reminderMinutes > 0 && now.getTime() >= startMs - cfg.reminderMinutes * MINUTE) {
          // Évite deux messages au même instant si le délai vaut déjà 24 h.
          if (!(cfg.reminder24h && cfg.reminderMinutes >= 1440)) {
            await sendEventToGuild(guild, cfg, ev, 'reminder');
          }
        }
      }
    }
  }
}

/** Force immédiatement un cycle de collecte (utilisé par /admin refresh). */
export async function forcePoll() {
  lastPollAt = 0;
  return tick();
}

/** Marque la collecte comme déjà effectuée (utile pour les tests). */
export function markPollDone(at = new Date()) {
  lastPollAt = at.getTime();
}

export function isBusy() { return busy; }
