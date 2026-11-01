# 🎮 Bot Discord « Events Pokémon GO »

Bot qui informe automatiquement un serveur Discord des événements Pokémon GO :
Community Days, Raid Hours, Spotlight Hours, saisons, événements spéciaux,
rotations de raids, d'œufs et de Pokémon vedettes.

Conforme au **cahier des charges version 1.0 du 1er novembre 2026** (fichier
`Cahier des charges – Bot Discord Events Pokémon GO.md`), y compris les
exigences d'hébergement sur l'offre gratuite **Wispbyte** (≈ 512 Mo de RAM,
1 Go de stockage).

---

## 1. Fonctionnalités

| Exigence (CDC) | Réalisation |
| --- | --- |
| 4.1 Collecte des événements | Interrogation toutes les 30 min (configurable) de la source JSON **LeekDuck via ScrapedDuck**, avec **source de secours** automatique (`leak-duck`). Normalisation, anti-doublons mémorisés. |
| 4.2 Notifications automatiques | Embed « nouvel événement », **rappel configurable** (par défaut 1 h, option 24 h), message « **commence maintenant** », mention de rôle optionnelle, filtrage par type. |
| 4.3 Commandes slash | `/events`, `/events today`, `/events type`, `/setup`, `/rotations`, `/help`, `/ping`, `/admin`. |
| 4.4 Configuration multi-serveurs | Chaque serveur a sa propre configuration en base (salon, rôle, types, délai, langue). |
| 4.5 Localisation (GPS) | Champ « Lieu » avec coordonnées à 5 décimales et lien carte, géocodage OSM/Nominatim mis en cache, correction manuelle par `/admin location`. |
| 4.6 Fuseaux horaires | Heure locale du lieu + heure française + décalage, calculés **à la date de l'événement** (donc correct pendant les changements d'heure), horodatages Discord dynamiques. |
| 4.7 Rotations | Raids (par palier), œufs (par distance), Pokémon vedettes ; notification à chaque changement, salon dédié possible, consultation par `/rotations`. |
| 5.3 Modèle de données | Tables `guild_config`, `events`, `rotations`, `rotation_state`, `notifications`, `geocache`. |
| 6 Contraintes Wispbyte | SQLite sans compilation native, mémoire < 200 Mo, backoff et tolérance d'erreur, reprise propre après redémarrage, purge automatique. |

---

## 2. Prérequis

- **Node.js 22.5 ou plus** (24 recommandé : l'image `nodejs_24` de Wispbyte).
  Node 24 embarque SQLite (`node:sqlite`) : **aucune compilation native** n'est
  nécessaire, contrairement à `better-sqlite3`.
- Un **bot Discord** créé sur le [portail développeur](https://discord.com/developers/applications).
- `npm install` (deux dépendances seulement : `discord.js` et `node-cron`).

### Création du bot Discord

1. Créez une application sur <https://discord.com/developers/applications>.
2. Onglet **Bot** → *Add Bot* → copiez le **Token** (jamais dans le code !).
3. Onglet **Bot** : aucun *Privileged Gateway Intent* n'est à activer
   (le bot ne lit pas les messages).
4. Onglet **OAuth2 → URL Generator** :
   - *Scopes* : `bot`, `applications.commands`
   - *Bot Permissions* : `View Channels`, `Send Messages`, `Embed Links`,
     `Mention Everyone` (utile pour mentionner un rôle), `Use Application Commands`.
5. Ouvrez l'URL générée pour inviter le bot sur votre serveur.
6. Onglet **General Information** : notez l'**Application ID** (= `DISCORD_CLIENT_ID`).

---

## 3. Installation locale

```bash
npm install
cp .env.example .env        # puis renseignez DISCORD_TOKEN et DISCORD_CLIENT_ID
npm run dry                 # test à blanc : collecte + aperçu des messages
npm start                   # démarrage du bot
```

Commandes utiles :

| Commande | Rôle |
| --- | --- |
| `npm start` | Démarre le bot. |
| `npm run dry` | Teste toute la chaîne **sans Discord** : collecte, embeds, rotations. |
| `npm run dry -- --embed "Community"` | Aperçu des 3 messages (nouveau / rappel / début) d'un événement. |
| `npm run dry -- --place "New York, USA" --embed "Master League"` | Vérifie le géocodage et la conversion d'heure (CDC 4.5/4.6). |
| `npm run test:reminders` | Recette des rappels et de l'absence de doublons après redémarrage. |
| `npm run test:commands` | Recette des commandes slash (dont l'indépendance entre serveurs). |
| `npm run check:i18n` | Contrôle de complétude des traductions fr/en. |
| `npm run register` | Ré-enregistre les commandes sans redémarrer le bot. |

---

## 4. Variables d'environnement

| Variable | Obligatoire | Défaut | Description |
| --- | --- | --- | --- |
| `DISCORD_TOKEN` | ✅ | — | Token du bot. |
| `DISCORD_CLIENT_ID` | ✅ | — | ID de l'application Discord. |
| `TEST_GUILD_ID` | conseillé | — | Serveur de test : commandes disponibles **immédiatement** (sinon propagation globale sous ~1 h). |
| `BOT_OWNER_ID` | conseillé | — | Votre ID Discord : seul vous pouvez utiliser `/admin`. |
| `EVENTS_SOURCE_URL` | — | ScrapedDuck | Base de la source primaire. |
| `EVENTS_SOURCE_FALLBACK_URL` | — | leak-duck | Base de la source de secours. |
| `POLL_INTERVAL` | — | `30` | Intervalle de collecte, en minutes (5–240). |
| `REMINDER_MINUTES` | — | `60` | Délai de rappel par défaut (modifiable par serveur). |
| `DEFAULT_TIMEZONE` | — | `Europe/Paris` | Fuseau de l'heure française. |
| `GEOCODE_ENABLED` | — | `1` | Active le géocodage OSM/Nominatim. |
| `NOMINATIM_USER_AGENT` | conseillé | — | User-Agent identifiable (exigé par Nominatim). Mettez-y votre e-mail de contact. |
| `LOG_LEVEL` | — | `info` | `debug` \| `info` \| `warn` \| `error`. |
| `DB_PATH` | — | `./data/bot.db` | Chemin de la base SQLite. |
| `PLACES_FILE` | — | `./data/places.json` | Fichier facultatif de lieux déclarés (voir §7). |

---

## 5. Commandes slash

### Pour tous

| Commande | Description |
| --- | --- |
| `/events` | Événements en cours et à venir. |
| `/events today true` | Événements du jour. |
| `/events type community-day` | Filtre par type. |
| `/rotations raids` · `/rotations oeufs` · `/rotations vedettes` | État des rotations. |
| `/help` · `/ping` | Aide et état du bot. |

### Administration du serveur (permission « Gérer le serveur »)

| Commande | Description |
| --- | --- |
| `/setup channel <salon>` | Salon des notifications. |
| `/setup role <rôle>` | Rôle à mentionner (sans argument : plus de mention). |
| `/setup rotations-channel <salon>` | Salon dédié aux rotations. |
| `/setup types` | Types d'événements et rotations notifiés (`add`, `remove`, `reset`). |
| `/setup reminder <délai> [en_24h]` | Délai de rappel (désactivé → 24 h) + rappel 24 h optionnel. |
| `/setup lang <fr\|en>` | Langue des messages. |
| `/setup view` | Configuration actuelle. |

### Propriétaire du bot (`BOT_OWNER_ID`)

| Commande | Description |
| --- | --- |
| `/admin location <événement> [lieu] [latitude] [longitude] [fuseau]` | Corrige le lieu / les coordonnées (géocodage si seuls le nom est fourni). |
| `/admin rotation-reset <catégorie>` | Force l'annonce de la prochaine rotation. |
| `/admin refresh` | Relance immédiatement la collecte. |
| `/admin stats` | Événements, notifications, rotations, mémoire. |

---

## 6. Déploiement sur Wispbyte

1. Créez un compte sur **wispbyte.com** et un **serveur de type bot Discord (Node.js)**.
2. Dans le panel, notez la **mémoire** et le **disque** de l'offre gratuite
   (≈ 512 Mo / 1 Go selon les retours d'utilisateurs — à confirmer au moment du déploiement).
3. Onglet **Startup** (déploiement depuis GitHub) :

   | Champ (panel) | Valeur | Notes |
   |---|---|---|
   | *Image* (Docker image) | `nodejs_24` | Puis cliquer **Use this image**. |
   | *Git Repo Address* (`GIT_ADDRESS`) | `https://github.com/passasa83/bot-events-pokemon-go` | Dépôt public : pas besoin d'identifiants Git. |
   | *Install Branch* (`BRANCH`) | `main` | |
   | *User Uploaded Files* (`USER_UPLOAD`) | **off** (0) | Laisser Git cloner le dépôt. |
   | *Auto Update* | **on** (recommandé) | Récupère le dernier code à chaque démarrage. |
   | *JS file* (`JS_FILE`) | `index.js` (par défaut) ou `src/index.js` | Les deux fonctionnent : `index.js` à la racine délègue au vrai point d'entrée `src/index.js`. |
   | *Git Username* / *Git Access Token* | vides | Dépôt public. |
   | *Packages* | vide | `discord.js` et `node-cron` sont déclarés dans `package.json` et installés par l'installation automatique. |
   | *Uninstall Node packages* | vide | |

   > Si la console affiche `Cannot find package 'discord.js'` au démarrage,
   > ajoutez `discord.js node-cron` dans le champ *Packages* (l'œuf les réinstalle
   > à chaque démarrage).

4. **Variables d'environnement** : renseignez `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`
   (et si le panel le propose `BOT_OWNER_ID`, `TEST_GUILD_ID`, …). Si le panel ne
   permet pas d'ajouter de variables libres, créez un fichier **`.env`** dans le
   gestionnaire de fichiers avec les mêmes valeurs : le bot le lit automatiquement
   (voir `.env.example`). Ne placez jamais le token dans un fichier versionné.
5. Onglet **Console** : démarrez le serveur. L'installation `npm install` se fait
   automatiquement ; vérifiez le message `Connecté en tant que …`.
6. Invitez le bot avec le lien OAuth2 (voir §2).
7. Dans votre serveur : `/setup channel <salon>` puis, si vous voulez un ping,
   `/setup role <rôle>`.

### Bonnes pratiques Wispbyte

- **Premier démarrage** : la base étant vide, le bot enregistre les événements
  déjà publiés **sans les annoncer** (sinon il balayerait ~50 messages dans
  chaque serveur). Seuls les événements publiés *après* le premier démarrage
  sont annoncés.
- **RAM** : le bot tourne autour de **80 Mo** de mémoire résidente mesurée
  (limite imposée : 200 Mo). Aucun cache volumineux n'est gardé en mémoire.
- **Redémarrages** : la table `notifications` garantit qu'**aucun doublon** n'est
  renvoyé après un redémarrage ; les rappels manqués sont rattrapés si le retard
  reste inférieur à 30 minutes.
- **IP partagée** : les envois sont espacés de 300 ms et discord.js applique
  déjà un *backoff* automatique sur les *rate limits*. Une erreur d'envoi n'arrête
  jamais le bot : elle est journalisée et la notification est retentée au cycle suivant.
- **Stockage** : les événements terminés depuis plus de 30 jours sont purgés
  automatiquement chaque jour.

---

## 7. Lieux et coordonnées GPS (CDC 4.5)

La source LeekDuck **ne fournit pas de coordonnées GPS ni de fuseau horaire**
(point « à vérifier » du cahier des charges, vérifié le 1/11/2026). Le module de
localisation est néanmoins complet et s'active dès qu'un lieu est connu :

1. **`/admin location`** : correction manuelle (nom seul → géocodage automatique,
   ou coordonnées saisies directement avec fuseau IANA).
2. **`data/places.json`** (facultatif) : déclarez les lieux d'avance, par
   identifiant d'événement ou par slug de titre :

   ```json
   {
     "pokemon-go-fest-2027-paris": "Paris, France",
     "wild-area-2026-mexico": { "name": "Autódromo Hermanos Rodríguez", "lat": 19.4042, "lon": -99.0907, "tz": "America/Mexico_City" }
   }
   ```

3. **Géocodage** : OpenStreetMap Nominatim, **1 requête/seconde maximum**,
   User-Agent identifiable, et **mise en cache définitive en SQLite**
   (un lieu n'est géocodé qu'une seule fois, jamais deux).
4. **Échec** : la notification part quand même, avec le nom du lieu sans
   coordonnées, et l'incident est journalisé.

Le fuseau horaire du lieu est déduit des coordonnées via une table de ~80 villes
internationales (Paris, New York, Tokyo, Mexico, Sentosa, Osaka, São Paulo…),
puis, à défaut, estimé par longitude. Cette approche évite d'embarquer la base
`geo-tz` (trop lourde pour 512 Mo de RAM) tout restant précis pour les villes
où se tiennent les événements Pokémon GO.

**Exemple rendu** (événement à New York, en novembre) :

> 🏁 **Début**
> 16:00 à New York = 22:00 en France (+6 h)
> <t:1793739600:F>

Pendant l'heure d'été, le même événement affichera « +5 h » : le décalage est
recalculé **à la date de l'événement**, jamais figé.

---

## 8. Source de données

| | Source primaire | Source de secours |
| --- | --- | --- |
| Projet | [bigfoott/ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) (branche `data`) | [pokelitee/leak-duck](https://github.com/pokelitee/leak-duck) (branche `data`) |
| Données | `events.json`, `raids.json`, `eggs.json` | `events.json`, `raid_bosses.json`, `egg_pool.json` |
| Mise à jour | régulière (scraping de LeekDuck.com) | ~toutes les heures |
| Licence | AGPL-3.0 | MIT |

- Les deux projets **scrapent LeekDuck.com** : les messages du bot mentionnent
  systématiquement la source en pied de page (`Source : LeekDuck (ScrapedDuck)`).
- **Niantic ne fournit aucune API officielle** d'événements : c'est pourquoi le
  cahier des charges prévoyait une source communautaire et une source de secours.
- Avant une mise en production longue, vérifiez les conditions d'utilisation de
  LeekDuck et signalez l'usage de vos données (voir CDC §8, conformité).
- Le bot est tolérant : si la source primaire est en erreur (réseau, format
  modifié), il bascule automatiquement sur la secours et journalise le motif.

---

## 9. Architecture

```
├── index.js                  ← point d'entrée (connexion, signaux, filets de sécurité)
├── config.js                 ← variables d'environnement + contrôles
├── logger.js                 ← logs à niveaux
├── db.js                     ← SQLite (node:sqlite, repli better-sqlite3) + schéma
├── store.js                  ← accès aux tables (config, events, rotations, notifications)
├── collector.js              ← module de collecte (CDC 5.4 §1)
│   ├── sources/leekduck.js   ← source primaire + normalisation
│   └── sources/leakduck.js   ← source de secours
├── scheduler.js              ← module de planification (CDC 5.4 §2)
├── notifier.js               ← embeds + envois (CDC 5.4 §3)
├── commands/                 ← module de commandes (CDC 5.4 §4)
│   ├── definitions.js        ← déclarations slash
│   ├── events.js, setup.js, rotations.js, misc.js, admin.js
│   └── index.js              ← routage + enregistrement
├── time.js                   ← fuseaux horaires (API Intl, sans dépendance)
├── geo.js                    ← géocodage Nominatim + cache
├── i18n.js                   ← fr / en
├── eventTypes.js             ← catalogue des types d'événements
└── scripts/                  ← dry-run, tests de recette, enregistrement
```

**Cycle interne** (une tâche par minute) :

1. collecte si l'intervalle est écoulé → normalisation → persistance → annonce des nouveaux événements ;
2. vérification des rappels / débuts pour chaque serveur, selon sa configuration ;
3. comparaison des rotations : seules les **additions** déclenchent une notification ;
4. purge quotidienne (événements terminés depuis > 30 jours).

---

## 10. Recette (CDC §11)

| Critère | Vérification |
| --- | --- |
| Reste connecté plus de 7 jours | Laisser tourner sur Wispbyte ; les exceptions sont absorbées et journalisées. |
| Nouvel événement publié en moins d'une heure | `POLL_INTERVAL` = 30 min par défaut. |
| Aucun doublon après redémarrage | `npm run test:reminders` (test « 2e passage ») + table `notifications`. |
| Commandes < 3 s | Réponses en base SQLite locale ; la collecte n'est jamais faite dans le fil de la commande. `npm run test:commands` vérifie chaque commande. |
| Configuration indépendante par serveur | Table `guild_config` clé par `guild_id` ; testé explicitement par `npm run test:commands`. |
| Mémoire < 200 Mo | ≈ 80 Mo mesurés avec `npm run dry`. |

---

## 11. Limites connues (hors périmètre version 1)

- La source LeekDuck ne fournit **ni coordonnées ni fuseau** : les événements
  localisés dépendent de `/admin location` ou de `data/places.json` (voir §7).
- Les événements « heure locale » (Community Day, 14 h–17 h partout) sont
  planifiés dans le fuseau du bot (`Europe/Paris`) pour les rappels, car leur
  instant réel dépend du fuseau de chaque joueur.
- La carte des raids, le calculateur de CP/IV, le suivi de compte, le dashboard
  web et la musique sont **explicitement exclus** de la version 1 (CDC §2).

---

## 12. Licence et mentions

Code sous licence MIT. Données d'événements : LeekDuck.com, collectées via les
projets communautaires ScrapedDuck (AGPL-3.0) et leak-duck (MIT) — le pied de
page des messages mentionne la source.
