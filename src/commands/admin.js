/**
 * Commande `/admin` (CDC 4.5 – correction manuelle des lieux).
 * Réservée au propriétaire du bot (variable BOT_OWNER_ID) : double verrou,
 * la permission Discord Administrator n'est pas suffisante.
 */

import config from '../config.js';
import log from '../logger.js';
import { t } from '../i18n.js';
import * as store from '../store.js';
import { geocode } from '../geo.js';
import { timezoneFromCoords } from '../time.js';
import { forcePoll } from '../scheduler.js';

const reply = (interaction, content) => interaction.reply({ content, ephemeral: true });

export async function handleAdmin(interaction) {
  const lang = store.getGuildConfig(interaction.guildId).lang;

  // 1. Verrou propriétaire.
  if (!config.ownerId) return reply(interaction, '⛔ Variable `BOT_OWNER_ID` non configurée sur le bot.');
  if (interaction.user.id !== config.ownerId) return reply(interaction, t(lang, 'admin.ownerOnly'));

  const sub = interaction.options.getSubcommand();

  /* ---------- /admin location ---------- */
  if (sub === 'location') {
    const term = interaction.options.getString('evenement');
    const place = interaction.options.getString('lieu');
    const lat = interaction.options.getNumber('latitude');
    const lon = interaction.options.getNumber('longitude');
    const tz = interaction.options.getString('fuseau');

    const target = store.getEvent(term) || store.findEventsByName(term)[0];
    if (!target) return reply(interaction, t(lang, 'admin.location.notFound'));

    let placeName = place ?? target.placeName;
    let latitude = lat ?? target.latitude;
    let longitude = lon ?? target.longitude;

    // Coordonnées absentes mais lieu fourni → géocodage (cache SQLite inclus).
    if (placeName && (latitude === null || longitude === null)) {
      const geo = await geocode(placeName);
      if (geo) {
        placeName = geo.displayName || placeName;
        latitude = geo.latitude;
        longitude = geo.longitude;
      } else {
        log.warn(`Géocodage échoué pour "${placeName}" (${target.id}) : enregistrement sans coordonnées.`);
      }
    }

    const timezone = tz
      ?? (Number.isFinite(latitude) && Number.isFinite(longitude) ? timezoneFromCoords(latitude, longitude) : target.timezone);

    store.overrideEventLocation(target.id, { placeName, latitude, longitude, timezone });

    return reply(interaction, t(lang, 'admin.location.ok', {
      event: target.title,
      place: placeName || '—',
      lat: Number.isFinite(latitude) ? latitude.toFixed(5) : '—',
      lon: Number.isFinite(longitude) ? longitude.toFixed(5) : '—',
      tz: timezone || '—',
    }));
  }

  /* ---------- /admin rotation-reset ---------- */
  if (sub === 'rotation-reset') {
    const category = interaction.options.getString('categorie');
    store.forceRotationNotify(category);
    store.forgetRotationNotifications(category);
    const polled = await forcePoll();
    return reply(interaction, `${t(lang, 'admin.rotationReset', { cat: category })}${polled ? '' : ' (collecte déjà en cours)'}`);
  }

  /* ---------- /admin refresh ---------- */
  if (sub === 'refresh') {
    await reply(interaction, '🔄 Collecte lancée…');
    const polled = await forcePoll();
    const s = store.stats();
    return interaction.editReply(`✅ Collecte ${polled ? 'terminée' : 'en cours (relance ignorée)'}. ${s.events} événement(s) en base.`);
  }

  /* ---------- /admin stats ---------- */
  if (sub === 'stats') {
    const s = store.stats();
    const mem = process.memoryUsage();
    const uptime = Math.round(process.uptime() / 60);
    return reply(interaction,
      `${t(lang, 'admin.stats', s)}\n⏱️ Uptime : ${uptime} min · 💾 RSS : ${Math.round(mem.rss / 1048576)} Mo`);
  }

  return reply(interaction, t(lang, 'generic.error'));
}
