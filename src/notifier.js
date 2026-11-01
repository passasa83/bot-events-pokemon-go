/**
 * Module de notification (CDC 5.4 – étape 3).
 * Construit les embeds (maquette CDC §9) et les envoie aux serveurs concernés,
 * avec :
 *  - anti-doublon avant/après envoi (table `notifications`) ;
 *  - mention de rôle optionnelle et encadrée (allowed_mentions) ;
 *  - filtrage par type d'événement et par serveur (config indépendante) ;
 *  - espacement des envois et tolérance aux erreurs Discord (IP partagée,
 *    rate limits : le bot ne doit jamais planter pour un envoi raté).
 */

import { EmbedBuilder } from 'discord.js';
import config from './config.js';
import log from './logger.js';
import { t, typeLabel } from './i18n.js';
import * as time from './time.js';
import { getGuildConfig, isTypeEnabled, claimNotification, forgetNotification } from './store.js';

export const COLORS = {
  new: 0x5865f2,
  reminder: 0xfaa61a,
  start: 0x57f287,
  rotation: 0xeb459e,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Source affichée en pied de page (mise à jour à chaque collecte). */
let sourceLabel = 'LeekDuck';
export function setSourceLabel(label) { if (label) sourceLabel = label; }

/* ------------------------------------------------------------------ */
/* Formats d'heure (CDC 4.6)                                           */
/* ------------------------------------------------------------------ */

const localeOf = (lang) => (lang === 'en' ? 'en-US' : 'fr-FR');

/** Champ « Début » : heure locale du lieu, heure française et décalage. */
export function startValue(ev, lang) {
  const loc = localeOf(lang);

  if (ev.timeMode === 'local') {
    const sameDay = String(ev.startRaw ?? '').slice(0, 10) === String(ev.endRaw ?? '').slice(0, 10);
    const text = sameDay ? time.rawRange(ev.startRaw, ev.endRaw, loc) : time.rawDateTime(ev.startRaw, loc);
    return `**${text}** — ${t(lang, 'field.localTime')}`;
  }

  const lines = [];
  if (ev.timezone && ev.placeName && ev.startUtc) {
    const localClock = time.clockInZone(ev.startUtc, ev.timezone, loc);
    const frClock = time.clockInZone(ev.startUtc, config.defaultTimezone, loc);
    const delta = time.zoneDeltaMinutes(ev.startUtc, ev.timezone, config.defaultTimezone);
    lines.push(t(lang, 'notify.place.line', {
      local: localClock,
      zone: time.zoneLabel(ev.timezone),
      fr: frClock,
      delta: time.deltaLabel(delta),
    }));
  }
  lines.push(time.discordTimestamp(ev.startUtc, 'F'));
  return lines.join('\n');
}

/** Champ « Fin ». */
export function endValue(ev, lang) {
  if (ev.timeMode === 'local') {
    return `**${time.rawDateTime(ev.endRaw, localeOf(lang))}** — ${t(lang, 'field.localTime')}`;
  }
  return time.discordTimestamp(ev.endUtc, 'F');
}

/** Champ « Lieu » (CDC 4.5) : nom, coordonnées à 5 décimales et lien carte. */
export function placeValue(ev, lang) {
  if (!ev.placeName) return null;
  const lines = [`**${ev.placeName}**`];
  if (Number.isFinite(ev.latitude) && Number.isFinite(ev.longitude)) {
    const lat = ev.latitude.toFixed(5);
    const lon = ev.longitude.toFixed(5);
    const map = t(lang, 'notify.map', { lat, lon });
    lines.push(t(lang, 'notify.place.coords', { lat, lon, map }));
    if (ev.timezone) lines.push(`🌐 \`${ev.timezone}\``);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Embeds d'événements                                                 */
/* ------------------------------------------------------------------ */

/**
 * Embed d'événement (nouveau / rappel / début) – maquette CDC §9.
 * @param {object} ev événement normalisé
 * @param {'new'|'reminder'|'reminder24'|'start'} kind
 */
export function eventEmbed(ev, kind, lang = 'fr') {
  const embed = new EmbedBuilder()
    .setColor(COLORS[kind === 'new' ? 'new' : kind === 'start' ? 'start' : 'reminder'])
    .setFooter({ text: t(lang, 'notify.footer', { source: sourceLabel }) });

  if (ev.link) embed.setURL(ev.link);
  if (ev.image) embed.setImage(ev.image);

  const badge = kind === 'new' ? '🆕 ' : kind === 'start' ? '🚀 ' : '⏰ ';
  embed.setTitle(`${badge}${ev.title}`);

  if (kind === 'new') embed.setDescription(t(lang, 'notify.desc.new'));
  else if (kind === 'start') embed.setDescription(t(lang, 'notify.desc.start', { title: ev.title }));
  else if (kind === 'reminder24') embed.setDescription(t(lang, 'notify.desc.reminder24'));
  else embed.setDescription(t(lang, 'notify.desc.reminder', { when: time.discordTimestamp(ev.startUtc, 'R') }));

  const fields = [
    { name: `🏷️ ${t(lang, 'field.type')}`, value: typeLabel(lang, ev.type), inline: true },
    { name: `🏁 ${t(lang, 'field.start')}`, value: startValue(ev, lang) },
    { name: `🏁 ${t(lang, 'field.end')}`, value: endValue(ev, lang) },
  ];

  const place = placeValue(ev, lang);
  if (place) fields.push({ name: `📍 ${t(lang, 'field.place')}`, value: place });

  // Détails utiles : bonus de Spotlight Hour / Community Day, boss de raid.
  const sp = ev.details?.spotlight;
  if (sp?.bonus) {
    fields.push({ name: `⭐ ${t(lang, 'field.bonus')}`, value: `**${sp.name}** — ${sp.bonus}` });
  }
  const cd = ev.details?.communityday;
  if (cd?.bonuses?.length) {
    fields.push({
      name: `🎁 ${t(lang, 'field.bonus')}`,
      value: cd.bonuses.slice(0, 6).map((b) => `• ${b}`).join('\n').slice(0, 1024),
    });
  }
  const bosses = ev.details?.raidbattles?.bosses;
  if (bosses?.length) {
    fields.push({
      name: `⚔️ ${t(lang, 'field.bosses')}`,
      value: bosses.slice(0, 10).map((b) => (b.canBeShiny ? `✨ ${b.name}` : b.name)).join(' · ').slice(0, 1024),
    });
  }

  fields.push({ name: 'ℹ️ Info', value: t(lang, ev.timeMode === 'local' ? 'field.timeMode.local' : 'field.timeMode.absolute'), inline: false });
  embed.addFields(fields);
  return embed;
}

/* ------------------------------------------------------------------ */
/* Embeds de rotations (CDC 4.7)                                       */
/* ------------------------------------------------------------------ */

const ROTATION_META = {
  raids: { icon: '⚔️', titleKey: 'rot.notify.raids', bucketKey: 'rot.raids' },
  eggs: { icon: '🥚', titleKey: 'rot.notify.eggs', bucketKey: 'rot.eggs' },
  vedettes: { icon: '⭐', titleKey: 'rot.notify.vedettes', bucketKey: 'rot.vedettes' },
};

/**
 * Embed d'une rotation, regroupé par palier / distance (CDC 4.7).
 * @param {'raids'|'eggs'|'vedettes'} category
 * @param {Array} items éléments normalisés
 * @param {{lang?:string, changedAt?:Date, source?:string}} opts
 */
export function rotationEmbed(category, items, opts = {}) {
  const lang = opts.lang || 'fr';
  const meta = ROTATION_META[category] || ROTATION_META.raids;
  const embed = new EmbedBuilder()
    .setColor(COLORS.rotation)
    .setTitle(`${meta.icon} ${t(lang, meta.titleKey)}`)
    .setFooter({ text: t(lang, 'notify.footer', { source: opts.source || sourceLabel }) });

  if (!items.length) {
    embed.setDescription(t(lang, 'rot.empty'));
    return embed;
  }

  // Regroupement par palier / distance.
  const groups = new Map();
  for (const it of items) {
    const key = it.bucket || '—';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  for (const [bucket, list] of groups) {
    const value = list.slice(0, 25).map((it) => {
      const shiny = it.canBeShiny ? '✨ ' : '';
      const bonus = it.details?.bonus ? ` — _${it.details.bonus}_` : '';
      return `${shiny}**${it.name}**${bonus}`;
    }).join('\n');
    embed.addFields({ name: `${bucket} (${list.length})`, value: value.slice(0, 1024) || '—' });
    if (embed.data.fields.length >= 25) break;
  }

  if (opts.changedAt) embed.setTimestamp(opts.changedAt);
  return embed;
}

/* ------------------------------------------------------------------ */
/* Envoi vers les serveurs                                             */
/* ------------------------------------------------------------------ */

/** Mention du rôle configuré, avec plafonnement des mentions autorisées. */
function mentionFor(cfg) {
  return {
    content: cfg.roleId ? `<@&${cfg.roleId}>` : undefined,
    allowedMentions: { roles: cfg.roleId ? [cfg.roleId] : [], users: [], parse: [] },
  };
}

/**
 * Envoie un événement à UN serveur donné (selon sa configuration).
 * @returns {boolean} true si le message a été envoyé
 */
export async function sendEventToGuild(guild, cfg, ev, kind) {
  if (!cfg.channelId) return false;
  // Filtrage par type d'événements choisi avec /setup types.
  if (!isTypeEnabled(cfg, ev.type)) return false;
  // Anti-doublon (redémarrage, double cycle) : on réserve, on libère si échec.
  if (!claimNotification(ev.id, guild.id, kind)) return false;

  try {
    const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      log.warn(`Salon introuvable ou non textuel pour le serveur ${guild.name} (${cfg.channelId}).`);
      forgetNotification(ev.id, guild.id, kind);
      return false;
    }
    const { content, allowedMentions } = mentionFor(cfg);
    await channel.send({ content, embeds: [eventEmbed(ev, kind, cfg.lang)], allowedMentions });
    log.info(`[${kind}] « ${ev.title} » → ${guild.name}`);
    await sleep(300); // évite les rafales sur une IP partagée
    return true;
  } catch (err) {
    forgetNotification(ev.id, guild.id, kind);
    log.exception(`Échec d'envoi (${kind}) vers ${guild.name}`, err);
    return false;
  }
}

/**
 * Envoie un événement à tous les serveurs configurés.
 * @param {import('discord.js').Client} client
 * @param {object} ev événement normalisé
 * @param {'new'|'reminder'|'reminder24'|'start'} kind
 * @returns {number} nombre de serveurs notifiés
 */
export async function announceEvent(client, ev, kind) {
  let sent = 0;
  for (const guild of [...client.guilds.cache.values()]) {
    const cfg = getGuildConfig(guild.id);
    if (await sendEventToGuild(guild, cfg, ev, kind)) sent += 1;
  }
  return sent;
}

/**
 * Envoie une rotation à tous les serveurs configurés.
 * @param {'raids'|'eggs'|'vedettes'} category
 */
export async function announceRotation(client, category, items, opts = {}) {
  let sent = 0;
  for (const guild of [...client.guilds.cache.values()]) {
    try {
      const cfg = getGuildConfig(guild.id);
      const enabled = category === 'raids' ? cfg.rotationRaids
        : category === 'eggs' ? cfg.rotationEggs
          : cfg.rotationVedettes;
      if (!enabled) continue;
      const channelId = cfg.rotationsChannelId || cfg.channelId;
      if (!channelId) continue;
      const target = `rotation:${category}`;
      if (!claimNotification(target, guild.id, 'rotation')) continue;

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        forgetNotification(target, guild.id, 'rotation');
        continue;
      }
      const { content, allowedMentions } = mentionFor(cfg);
      await channel.send({
        content,
        embeds: [rotationEmbed(category, items, { lang: cfg.lang, changedAt: new Date(), source: opts.source })],
        allowedMentions,
      });
      sent += 1;
      log.info(`[rotation:${category}] → ${guild.name}`);
      await sleep(300);
    } catch (err) {
      forgetNotification(`rotation:${category}`, guild.id, 'rotation');
      log.exception(`Échec d'envoi de la rotation ${category} vers ${guild.name}`, err);
    }
  }
  return sent;
}
