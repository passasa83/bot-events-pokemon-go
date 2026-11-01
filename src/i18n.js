/**
 * Internationalisation (CDC 4.3 – `/setup lang <fr/en>`).
 * Deux langues : français (défaut) et anglais. Clés plates, substitution {var}.
 */

export const LANGS = { fr: 'Français', en: 'English' };

const FR = {
  /* --- Commun --- */
  'generic.source': 'Source',
  'generic.none': 'Aucun',
  'generic.all': 'Tous',
  'generic.error': 'Une erreur est survenue. Réessayez dans quelques instants.',
  'generic.noPerm': 'Vous n’avez pas la permission d’utiliser cette commande.',
  'generic.noChannel': 'Aucun salon de notifications défini : un administrateur doit lancer `/setup channel`.',
  'generic.noRotationsChannel': 'Aucun salon de rotations défini : les rotations sont envoyées dans le salon principal.',
  'generic.never': 'jamais',

  /* --- Types d’événements --- */
  'type.community-day': 'Community Day',
  'type.raid-hour': 'Raid Hour',
  'type.pokemon-spotlight-hour': 'Spotlight Hour',
  'type.raid-day': 'Raid Day',
  'type.raid-battles': 'Raids',
  'type.max-battles': 'Max Battles',
  'type.max-mondays': 'Max Mondays',
  'type.go-battle-league': 'GO Battle League',
  'type.go-pass': 'GO Pass',
  'type.season': 'Saison',
  'type.event': 'Événement spécial',
  'type.research': 'Field Research',
  'type.wild-area': 'Wild Area',
  'type.pokemon-go-tour': 'Pokémon GO Tour',
  'type.egg-pool': 'Œufs',
  'type.unknown': 'Autre',

  /* --- Champs d’embed --- */
  'field.type': 'Type',
  'field.start': 'Début',
  'field.end': 'Fin',
  'field.place': 'Lieu',
  'field.bonus': 'Bonus',
  'field.bosses': 'Boss de raid',
  'field.pokemon': 'Pokémon',
  'field.timeMode.local': '⏰ Heure locale (sans conversion)',
  'field.timeMode.absolute': '🕐 Chaque lecteur voit l’heure dans son propre fuseau.',
  'field.localTime': 'heure locale',

  /* --- Notifications --- */
  'notify.new.badge': 'Nouvel événement',
  'notify.reminder.badge': 'Rappel',
  'notify.reminder24.badge': 'Rappel (24 h)',
  'notify.start.badge': 'Ça commence !',
  'notify.desc.new': 'Un nouvel événement Pokémon GO vient d’être annoncé.',
  'notify.desc.reminder': 'L’événement commence **{when}**.',
  'notify.desc.reminder24': 'L’événement commence dans **24 h**.',
  'notify.desc.start': '**{title}** vient de commencer !',
  'notify.footer': 'Source : {source}',
  'notify.place.line': '{local} à {zone} = {fr} en France ({delta})',
  'notify.place.coords': 'Coordonnées : `{lat}, {lon}` · [Voir la carte]({map})',
  'notify.map': 'https://www.google.com/maps?q={lat},{lon}',

  /* --- Rotations --- */
  'rot.title': 'Rotations en cours',
  'rot.raids': 'Boss de raid',
  'rot.eggs': 'Œufs',
  'rot.vedettes': 'Pokémon vedettes',
  'rot.notify.raids': 'Rotation des raids',
  'rot.notify.eggs': 'Rotation des œufs',
  'rot.notify.vedettes': 'Nouveaux Pokémon vedettes',
  'rot.notify.desc': 'La rotation vient de changer.',
  'rot.empty': 'Aucune donnée disponible pour l’instant.',
  'rot.shiny': '✨ Chromatique possible',
  'rot.noDates': 'Dates non fournies par la source.',
  'rot.updated': 'Mise à jour : {date}',
  'rot.bonus': 'Bonus',
  'rot.hours': '18h00 – 19h00 (heure locale)',

  /* --- /events --- */
  'events.title': 'Événements Pokémon GO',
  'events.now': '🟢 En cours',
  'events.upcoming': '🔵 À venir',
  'events.today': '📌 Événements du jour',
  'events.empty': 'Aucun événement à afficher pour le moment.',
  'events.localNote': 'Les heures indiquées « {local} » s’entendent dans le fuseau de chaque joueur.',
  'events.filter': 'Filtre appliqué : **{type}**',
  'events.more': '… et {n} événement(s) supplémentaire(s).',

  /* --- /setup --- */
  'setup.channel.ok': '✅ Salon de notifications : {channel}',
  'setup.role.ok': '✅ Rôle mentionné : {role}',
  'setup.role.none': '✅ Plus aucun rôle mentionné.',
  'setup.rotChannel.ok': '✅ Salon des rotations : {channel}',
  'setup.rotChannel.none': '✅ Salon des rotations retiré (retour au salon principal).',
  'setup.types.ok': '✅ Types notifiés : {types}',
  'setup.types.none': '✅ Aucun type d’événement notifié (désactivé).',
  'setup.reminder.ok': '✅ Rappel envoyé **{delay}** avant le début.',
  'setup.reminder.off': '✅ Rappel avant le début désactivé.',
  'setup.reminder24.ok': '✅ Rappel 24 h en plus : **{state}**',
  'setup.lang.ok': '✅ Langue des messages : **{lang}**',
  'setup.help': 'Configuration du serveur actuel',
  'setup.channel.required': 'Salon invalide ou introuvable.',
  'setup.badTypes': 'Paramètres invalides : utilisez `add`, `remove` ou `reset`.',

  /* --- /rotations --- */
  'rotations.usage': 'Précisez la catégorie : `/rotations raids`, `/rotations oeufs` ou `/rotations vedettes`.',

  /* --- /help & /ping --- */
  'help.title': 'Aide — Events Pokémon GO',
  'help.desc': 'Je publie automatiquement les événements Pokémon GO (Community Days, Raid Hours, Spotlight Hours, saisons…) dans ce serveur.',
  'help.commands': 'Commandes',
  'help.admin': 'Administration (administrateur du serveur)',
  'help.footer': 'Données : LeekDuck · Fuseau français : Europe/Paris',
  'ping.ok': 'Pong ! Latence : {ms} ms · Événements suivis : {events} · Serveurs : {guilds}',

  /* --- /admin --- */
  'admin.ownerOnly': '⛔ Réservé au propriétaire du bot.',
  'admin.location.ok': '✅ Lieu mis à jour pour **{event}** : {place} ({lat}, {lon}) · fuseau `{tz}`',
  'admin.location.notFound': '❌ Aucun événement ne correspond à cette recherche.',
  'admin.rotationReset': '✅ La prochaine rotation « {cat} » déclenchera une notification.',
  'admin.stats': '📊 {events} événements · {notifications} notifications · {rotations} rotations · {guilds} serveurs',
  'admin.unknownEvent': '❌ Événement introuvable. Utilisez `/events` pour lister les identifiants.',
};

const EN = {
  'generic.source': 'Source',
  'generic.none': 'None',
  'generic.all': 'All',
  'generic.error': 'An error occurred. Please try again shortly.',
  'generic.noPerm': 'You do not have permission to use this command.',
  'generic.noChannel': 'No notification channel set: an admin must run `/setup channel`.',
  'generic.noRotationsChannel': 'No rotation channel set: rotations go to the main channel.',
  'generic.never': 'never',

  'type.community-day': 'Community Day',
  'type.raid-hour': 'Raid Hour',
  'type.pokemon-spotlight-hour': 'Spotlight Hour',
  'type.raid-day': 'Raid Day',
  'type.raid-battles': 'Raids',
  'type.max-battles': 'Max Battles',
  'type.max-mondays': 'Max Mondays',
  'type.go-battle-league': 'GO Battle League',
  'type.go-pass': 'GO Pass',
  'type.season': 'Season',
  'type.event': 'Special event',
  'type.research': 'Field Research',
  'type.wild-area': 'Wild Area',
  'type.pokemon-go-tour': 'Pokémon GO Tour',
  'type.egg-pool': 'Eggs',
  'type.unknown': 'Other',

  'field.type': 'Type',
  'field.start': 'Starts',
  'field.end': 'Ends',
  'field.place': 'Location',
  'field.bonus': 'Bonus',
  'field.bosses': 'Raid bosses',
  'field.pokemon': 'Pokémon',
  'field.timeMode.local': '⏰ Local time (no conversion)',
  'field.timeMode.absolute': '🕐 Each reader sees the time in their own timezone.',
  'field.localTime': 'local time',

  'notify.new.badge': 'New event',
  'notify.reminder.badge': 'Reminder',
  'notify.reminder24.badge': 'Reminder (24 h)',
  'notify.start.badge': 'It’s starting!',
  'notify.desc.new': 'A new Pokémon GO event has just been announced.',
  'notify.desc.reminder': 'The event starts **{when}**.',
  'notify.desc.reminder24': 'The event starts in **24 h**.',
  'notify.desc.start': '**{title}** has just started!',
  'notify.footer': 'Source: {source}',
  'notify.place.line': '{local} in {zone} = {fr} in France ({delta})',
  'notify.place.coords': 'Coordinates: `{lat}, {lon}` · [View map]({map})',
  'notify.map': 'https://www.google.com/maps?q={lat},{lon}',

  'rot.title': 'Current rotations',
  'rot.raids': 'Raid bosses',
  'rot.eggs': 'Eggs',
  'rot.vedettes': 'Featured Pokémon',
  'rot.notify.raids': 'Raid rotation',
  'rot.notify.eggs': 'Egg rotation',
  'rot.notify.vedettes': 'New featured Pokémon',
  'rot.notify.desc': 'The rotation just changed.',
  'rot.empty': 'No data available yet.',
  'rot.shiny': '✨ Shiny available',
  'rot.noDates': 'Dates not provided by the source.',
  'rot.updated': 'Updated: {date}',
  'rot.bonus': 'Bonus',
  'rot.hours': '6:00 p.m. – 7:00 p.m. (local time)',

  'events.title': 'Pokémon GO events',
  'events.now': '🟢 Ongoing',
  'events.upcoming': '🔵 Upcoming',
  'events.today': '📌 Today',
  'events.empty': 'No event to show right now.',
  'events.localNote': 'Times marked “{local}” are in each player’s own timezone.',
  'events.filter': 'Filter applied: **{type}**',
  'events.more': '… and {n} more event(s).',

  'setup.channel.ok': '✅ Notification channel: {channel}',
  'setup.role.ok': '✅ Ping role: {role}',
  'setup.role.none': '✅ No role mentioned anymore.',
  'setup.rotChannel.ok': '✅ Rotation channel: {channel}',
  'setup.rotChannel.none': '✅ Rotation channel removed (back to the main channel).',
  'setup.types.ok': '✅ Event types notified: {types}',
  'setup.types.none': '✅ No event type notified (disabled).',
  'setup.reminder.ok': '✅ Reminder sent **{delay}** before the start.',
  'setup.reminder.off': '✅ Start reminder disabled.',
  'setup.reminder24.ok': '✅ Extra 24 h reminder: **{state}**',
  'setup.lang.ok': '✅ Message language: **{lang}**',
  'setup.help': 'Current server configuration',
  'setup.channel.required': 'Invalid or unknown channel.',
  'setup.badTypes': 'Invalid parameters: use `add`, `remove` or `reset`.',

  'rotations.usage': 'Pick a category: `/rotations raids`, `/rotations oeufs` or `/rotations vedettes`.',

  'help.title': 'Help — Events Pokémon GO',
  'help.desc': 'I automatically post Pokémon GO events (Community Days, Raid Hours, Spotlight Hours, seasons…) in this server.',
  'help.commands': 'Commands',
  'help.admin': 'Administration (server admin)',
  'help.footer': 'Data: LeekDuck · Default timezone: Europe/Paris',
  'ping.ok': 'Pong! Latency: {ms} ms · Tracked events: {events} · Servers: {guilds}',

  'admin.ownerOnly': '⛔ Reserved for the bot owner.',
  'admin.location.ok': '✅ Location updated for **{event}**: {place} ({lat}, {lon}) · timezone `{tz}`',
  'admin.location.notFound': '❌ No event matches this search.',
  'admin.rotationReset': '✅ The next “{cat}” rotation will trigger a notification.',
  'admin.stats': '📊 {events} events · {notifications} notifications · {rotations} rotations · {guilds} servers',
  'admin.unknownEvent': '❌ Event not found. Use `/events` to list identifiers.',
};

const TABLE = { fr: FR, en: EN };

/** Tables de traduction exposées (utile aux scripts de vérification). */
export const STRINGS = TABLE;

/** Traduit une clé, avec substitution de `{variables}`. */
export function t(lang, key, vars = {}) {
  const table = TABLE[lang] || FR;
  let text = table[key] ?? FR[key] ?? key;
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** Délai lisible : 60 → « 1 h », 1440 → « 24 h », 30 → « 30 min ». */
export function formatDelay(minutes, lang = 'fr') {
  if (!minutes) return lang === 'fr' ? 'désactivé' : 'disabled';
  if (minutes % 1440 === 0) return `${minutes / 1440} h`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return lang === 'fr' ? `${minutes} min` : `${minutes} min`;
}

/** Libellé d’un type d’événement (avec repli sur le slug inconnu). */
export function typeLabel(lang, type) {
  if (!type) return t(lang, 'type.unknown');
  const key = `type.${type}`;
  const out = t(lang, key);
  return out === key ? type : out;
}
