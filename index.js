/**
 * Point d'entrée racine.
 *
 * Certains hébergeurs (panel Pterodactyl/Wispbyte) lancent `index.js` à la
 * racine du dépôt. Ce fichier ne fait que déléguer au vrai point d'entrée
 * du bot : toute la logique reste dans `src/index.js`.
 */

import './src/index.js';
