# Cahier des charges – Bot Discord « Events Pokémon GO »

*Version 1.0 – 1er novembre 2026 – Hébergement : Wispbyte*

## 1. Contexte et objectif

Le projet consiste à créer un bot Discord qui informe automatiquement les membres d'un serveur des événements Pokémon GO (Community Days, Raid Hours, Spotlight Hours, saisons, événements spéciaux, etc.).

**Objectifs principaux :**

- Publier automatiquement dans un salon dédié les nouveaux événements dès leur annonce.
- Rappeler les événements avant leur début et à leur démarrage.
- Permettre aux membres de consulter les événements en cours et à venir via des commandes slash.
- Fonctionner 24h/24 sur l'offre gratuite de Wispbyte, avec une consommation de ressources minimale.

## 2. Périmètre

**Inclus :** notifications automatiques, rappels, rotations (raids, œufs, Pokémon vedettes), conversion des heures locales en heure française, commandes slash, configuration par serveur, rôle de ping optionnel, stockage local léger.

**Exclus (version 1) :** carte des raids, calculateur de CP/IV, suivi de compte joueur, dashboard web, musique ou modération.

## 3. Utilisateurs cibles

| Profil | Besoin |
| --- | --- |
| Membre du serveur | Être prévenu des événements, consulter le calendrier |
| Administrateur | Configurer le salon, le rôle de ping, les types d'événements et la langue |
| Développeur / propriétaire | Déployer, surveiller et mettre à jour le bot facilement |

## 4. Spécifications fonctionnelles

### 4.1 Récupération des événements

- Le bot interroge une source de données externe à intervalle régulier (toutes les 30 à 60 minutes).
- Source envisagée : le flux JSON communautaire de LeekDuck (ex. projet ScrapedDuck sur GitHub). Une source de secours devra être prévue, car il n'existe pas d'API officielle de Niantic. **À vérifier avant le développement** : disponibilité, format et conditions d'utilisation de la source.
- Chaque événement est normalisé : identifiant, titre, type, date de début, date de fin, image, lien, description courte, lieu et coordonnées GPS (si l'événement est localisé).
- Les événements déjà notifiés sont mémorisés pour éviter les doublons.

### 4.2 Notifications automatiques

- **Nouvel événement détecté :** embed Discord avec titre, type, dates (horodatage Discord dynamique, adapté au fuseau de chaque lecteur), image, lien et, si l'événement est localisé, lieu avec coordonnées GPS (voir 4.5).
- **Rappel avant le début :** délai configurable (par défaut 1 h avant, option 24 h avant).
- **Début de l'événement :** message « L'événement commence maintenant ».
- Mention optionnelle d'un rôle (ex. `@PokémonGO`) configurable par serveur.
- Filtrage par type d'événement (Community Day, Raid, Spotlight Hour, etc.).

### 4.3 Commandes slash

| Commande | Description | Permission |
| --- | --- | --- |
| `/events` | Liste des événements en cours et à venir | Tous |
| `/events today` | Événements du jour | Tous |
| `/events type <type>` | Filtre par type d'événement | Tous |
| `/setup channel <salon>` | Définit le salon de notifications | Gérer le serveur |
| `/setup role <rôle>` | Définit le rôle à mentionner | Gérer le serveur |
| `/setup types` | Choisit les types d'événements notifiés | Gérer le serveur |
| `/setup reminder <délai>` | Règle le délai de rappel | Gérer le serveur |
| `/setup lang <fr/en>` | Langue des messages | Gérer le serveur |
| `/help` | Aide et liste des commandes | Tous |
| `/ping` | Vérifie l'état du bot | Tous |

### 4.4 Configuration multi-serveurs

Chaque serveur possède sa propre configuration (salon, rôle, types, délai, langue) conservée en base de données.

### 4.5 Localisation des événements (coordonnées GPS)

Lorsqu'un événement se déroule à un endroit précis (GO Fest en présentiel, Safari Zone, événement en ville…), la notification indique son emplacement avec ses coordonnées GPS.

- **Contenu du champ « Lieu » :** nom du lieu, latitude et longitude en degrés décimaux (5 décimales, ex. `48.85837, 2.29448`) et un lien cliquable vers une carte (ex. `https://www.google.com/maps?q=48.85837,2.29448`).
- **Événements sans lieu :** les événements mondiaux ou en jeu uniquement (Community Day, Raid Hour…) n'affichent pas de champ « Lieu ».
- **Plusieurs lieux :** jusqu'à 5 lieux sont listés, chacun avec ses coordonnées.
- **Origine des coordonnées :** d'abord la source de données si elle les fournit. Sinon, géocodage du nom ou de l'adresse via un service gratuit (ex. OpenStreetMap Nominatim, limité à 1 requête par seconde, avec un User-Agent identifiable et le respect de sa politique d'usage). **À vérifier :** la source envisagée ne fournit pas forcément de coordonnées.
- **Économie de ressources :** chaque lieu n'est géocodé qu'une seule fois, puis stocké en base (SQLite).
- **Échec ou résultat ambigu :** la notification part quand même, avec le nom du lieu sans coordonnées, et l'incident est consigné dans les logs.
- **Correction manuelle :** le propriétaire du bot peut corriger les coordonnées d'un événement via une commande réservée (ex. `/admin location`).

### 4.6 Fuseaux horaires et heure française

Pour un événement localisé, la notification affiche l'heure locale du lieu, l'heure en France et le décalage entre les deux.

- **Exemple :** un événement à New York à 10h00 heure locale s'affiche « 10h00 à New York = 16h00 en France (décalage de +6 h) ».
- **Fuseau du lieu :** chaque événement localisé porte un fuseau horaire IANA (ex. `America/New_York`), fourni par la source ou déduit des coordonnées GPS (ex. bibliothèque `geo-tz`, à tester vu la RAM limitée).
- **Décalage calculé à la date de l'événement :** il n'est pas fixe. Entre New York et Paris, il passe à 5 h pendant quelques semaines par an, car les passages à l'heure d'été et d'hiver n'ont pas lieu aux mêmes dates en Europe et aux États-Unis.
- **Heure française :** fuseau `Europe/Paris` par défaut, avec prise en compte automatique de l'heure d'été.
- **Événements à l'heure locale de chaque joueur** (ex. Community Day, 14h à 17h partout) : l'heure est affichée telle quelle avec la mention « heure locale », sans conversion.
- **Événements à heure absolue :** l'horodatage dynamique Discord reste utilisé, car chaque lecteur le voit dans son propre fuseau.
- **Implémentation :** API `Intl` native de Node.js (ou `luxon`), sans dépendance lourde.

### 4.7 Rotations : raids, œufs et Pokémon vedettes

Le bot suit les rotations et annonce chaque changement.

- **Raids :** boss de raid en cours, regroupés par palier (1, 3, 5 étoiles, Méga, etc.), avec dates de début et de fin.
- **Œufs :** contenu des œufs en cours, regroupé par distance (2, 5, 7, 10 et 12 km, selon la saison).
- **Pokémon vedettes :** Pokémon mis en avant (apparitions augmentées, Spotlight Hour), avec bonus éventuel et possibilité de version chromatique si la source l'indique.
- **Notification :** un embed par catégorie à chaque changement de rotation, avec les dates converties comme en 4.6.
- **Commandes :** `/rotations raids`, `/rotations oeufs` et `/rotations vedettes` pour consulter l'état actuel.
- **Configuration :** les catégories s'activent ou se désactivent avec `/setup types`, et un salon distinct peut être défini pour les rotations (`/setup rotations-channel`).
- **Source de données :** à vérifier, car toutes les sources communautaires ne fournissent pas les raids, les œufs et les vedettes.

## 5. Spécifications techniques

### 5.1 Stack recommandée

- **Langage :** Node.js 24 (image `nodejs_24` choisie sur le panel Wispbyte) avec `discord.js` v14.
- **Planification :** tâches asynchrones intégrées (`node-cron`).
- **Requêtes HTTP :** `fetch` natif de Node.js.
- **Fuseaux horaires :** API `Intl` native de Node.js (ou `luxon`), base IANA.
- **Stockage :** SQLite (fichier local) via `better-sqlite3`, à tester sur Wispbyte car cette bibliothèque peut demander une compilation native, sans service de base de données externe.
- **Configuration :** variables d'environnement (`DISCORD_TOKEN`, `EVENTS_SOURCE_URL`, `POLL_INTERVAL`, `LOG_LEVEL`).

### 5.2 Permissions et intents Discord

- Aucun intent privilégié requis (le bot n'a pas besoin de lire les messages).
- Permissions : voir le salon, envoyer des messages, intégrer des liens, mentionner des rôles, utiliser les commandes slash.
- Portée OAuth2 : `bot` et `applications.commands`.

### 5.3 Modèle de données (SQLite)

- `guild_config` : identifiant du serveur, salon, rôle, salon des rotations, types activés, délai de rappel, langue.
- `events` : identifiant, titre, type, début, fin, image, lien, nom du lieu, latitude, longitude, fuseau horaire (IANA), mode d'heure (locale du lieu, locale du joueur ou absolue), date de dernière mise à jour.
- `rotations` : catégorie (raid, œuf, vedette), palier ou distance, nom du Pokémon, début, fin.
- `notifications` : identifiant de l'événement ou de la rotation, identifiant du serveur, type de notification (nouveau / rappel / début), date d'envoi.

### 5.4 Architecture

1. **Module de collecte** : récupère et normalise les événements.
2. **Module de planification** : détecte les événements à notifier selon l'heure courante.
3. **Module de notification** : construit et envoie les embeds.
4. **Module de commandes** : gère les commandes slash.
5. **Module de stockage** : accès SQLite.

## 6. Contraintes liées à Wispbyte

Wispbyte propose un hébergement gratuit de bots Discord basé sur le panel Pterodactyl, avec des ressources partagées. D'après les retours d'utilisateurs, l'offre gratuite comprend environ 512 Mo de RAM et 1 Go de stockage, ce qui suffit pour un petit bot. **Ces chiffres sont à confirmer sur le site au moment du déploiement**, car ils peuvent évoluer.

Contraintes à anticiper :

- **Ressources limitées :** dépendances minimales, pas de bibliothèque lourde, pas de cache volumineux en mémoire.
- **IP partagée :** des limites de débit (rate limits) Discord peuvent survenir. Le bot doit utiliser un backoff exponentiel et éviter les envois en rafale.
- **Redémarrages et maintenances possibles :** le bot doit reprendre proprement après un arrêt, sans renvoyer de notifications déjà envoyées (d'où la table `notifications`) et rattraper les rappels manqués si le retard est raisonnable.
- **Stockage :** la base SQLite doit rester petite (purge des événements terminés depuis plus de 30 jours).
- **Fiabilité :** l'offre gratuite ne garantit pas une disponibilité parfaite ; une montée en gamme ou un autre hébergeur reste possible si le besoin augmente.

## 7. Déploiement sur Wispbyte

1. Créer un compte sur wispbyte.com et un serveur de type bot Discord (Node.js).
2. Créer l'application et le bot sur le portail développeur Discord, puis récupérer le token.
3. Téléverser les fichiers du projet via le gestionnaire de fichiers du panel (ou depuis un dépôt Git si disponible).
4. Renseigner les variables d'environnement, dont le token, sans jamais le stocker dans le code.
5. Définir le fichier de démarrage (`index.js`) et installer les dépendances listées dans `package.json` avec `npm install`.
6. Démarrer le serveur et consulter la console pour vérifier la connexion.
7. Inviter le bot sur le serveur avec le lien OAuth2 généré.

## 8. Exigences non fonctionnelles

- **Performance :** consommation mémoire inférieure à 200 Mo en fonctionnement normal.
- **Robustesse :** gestion des erreurs réseau, des réponses invalides de la source et des erreurs de l'API Discord, sans plantage du bot.
- **Sécurité :** token en variable d'environnement, permissions minimales, commandes de configuration réservées aux administrateurs.
- **Journalisation :** logs lisibles (démarrage, collecte, notifications envoyées, erreurs) avec niveaux configurables.
- **Maintenabilité :** code modulaire commenté, README d'installation en français.
- **Conformité :** respect des conditions d'utilisation de Discord et de la source de données ; mention de la source dans les messages si requis.

## 9. Maquette d'un message de notification

- **Titre :** nom de l'événement
- **Description :** résumé court
- **Champs :** type, début (heure locale du lieu, heure française et décalage, ex. 10h00 New York = 16h00 France, +6 h), fin (horodatage Discord), lieu (nom, coordonnées GPS et lien carte, si l'événement est localisé)
- **Image :** visuel de l'événement
- **Pied de page :** source des données
- **Mention :** rôle configuré (optionnel)

## 10. Planning prévisionnel

| Phase | Contenu | Durée estimée |
| --- | --- | --- |
| 1 | Création du bot, squelette du projet, base SQLite | 1 jour |
| 2 | Collecte et normalisation des événements | 1 à 2 jours |
| 3 | Notifications automatiques et rappels | 2 jours |
| 4 | Commandes slash et configuration par serveur | 2 jours |
| 5 | Tests, gestion d'erreurs, déploiement sur Wispbyte | 1 à 2 jours |
| 6 | Documentation et mise en production | 1 jour |

## 11. Critères de recette

- Le bot reste connecté plus de 7 jours sans intervention.
- Un nouvel événement apparaît dans le salon en moins d'une heure après sa publication à la source.
- Aucun doublon de notification après un redémarrage.
- Les commandes slash répondent en moins de 3 secondes.
- La configuration d'un serveur n'affecte pas les autres.

## 12. Évolutions possibles

- Choix du fuseau horaire d'affichage par serveur (au lieu de Paris par défaut).
- Abonnement individuel par message privé.
- Dashboard web de configuration.
- Support de plusieurs langues supplémentaires.
