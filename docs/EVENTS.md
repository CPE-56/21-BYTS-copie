# EVENTS.md

## Vue d'ensemble

Ce document détaille tous les événements standardisés utilisés dans l'application 21 BYTS. L'architecture de l'application est entièrement basée sur les événements, ce qui signifie que tous les modules communiquent exclusivement via le bus d'événements central.

Les événements sont organisés par catégories fonctionnelles et chaque événement est documenté avec:

- Son type (constante définie dans `constants/event-types.js`)
- Sa structure de données (payload)
- Sa description et son objectif
- Les modules qui l'émettent généralement
- Les modules qui l'écoutent généralement
- Des exemples d'utilisation

## Structure commune des événements

Tous les événements suivent cette structure commune:

```javascript
{
  type: "EVENT_TYPE",           // Constante définie dans event-types.js
  payload: {                    // Données associées à l'événement
    // Dépend du type d'événement
  },
  meta: {                       // Métadonnées (optionnelles)
    timestamp: 1620000000000,   // Horodatage de l'événement
    source: "module-name",      // Module émetteur
    correlationId: "uuid-v4",   // ID de corrélation pour le suivi
    isError: false              // Indicateur d'erreur
  }
}
```

## Catégories d'événements

- [Application](#événements-dapplication)
- [Interface utilisateur](#événements-dinterface-utilisateur)
- [Téléchargement](#événements-de-téléchargement)
- [Authentification](#événements-dauthentification)
- [Métadonnées](#événements-de-métadonnées)
- [Conversion](#événements-de-conversion)
- [Configuration](#événements-de-configuration)
- [Erreurs](#événements-derreurs)

## Événements d'application

### `APP_INITIALIZED`

**Description**: Émis lorsque l'application a terminé son initialisation.

**Payload**: Aucun

**Émis par**: `main.js`

**Écouté par**: Tous les modules

**Exemple**:

```javascript
eventBus.publish({
  type: 'APP_INITIALIZED',
  meta: {
    timestamp: Date.now(),
    source: 'main'
  }
});
```

### `APP_SHUTDOWN_REQUESTED`

**Description**: Émis lorsque l'utilisateur demande la fermeture de l'application.

**Payload**: Aucun

**Émis par**: `ui-manager.js`

**Écouté par**: `main.js`, `download-manager.js`

**Exemple**:

```javascript
eventBus.publish({
  type: 'APP_SHUTDOWN_REQUESTED',
  meta: {
    timestamp: Date.now(),
    source: 'ui-manager'
  }
});
```

### `APP_SHUTDOWN_READY`

**Description**: Émis lorsqu'un module a terminé ses opérations de nettoyage et est prêt pour la fermeture.

**Payload**:

```javascript
{
  moduleId: 'download-manager'; // ID du module qui a terminé
}
```

**Émis par**: Tous les modules

**Écouté par**: `main.js`

**Exemple**:

```javascript
eventBus.publish({
  type: 'APP_SHUTDOWN_READY',
  payload: {
    moduleId: 'download-manager'
  },
  meta: {
    timestamp: Date.now(),
    source: 'download-manager'
  }
});
```

### `APP_UPDATE_AVAILABLE`

**Description**: Émis lorsqu'une nouvelle mise à jour est disponible.

**Payload**:

```javascript
{
  version: "1.2.0",           // Nouvelle version disponible
  releaseNotes: "...",        // Notes de version (Markdown)
  downloadUrl: "https://..." // URL de téléchargement
}
```

**Émis par**: `update-checker.js`

**Écouté par**: `ui-manager.js`

## Événements d'interface utilisateur

### `UI_READY`

**Description**: Émis lorsque l'interface utilisateur est prête.

**Payload**: Aucun

**Émis par**: `ui-manager.js`

**Écouté par**: Divers modules

### `URL_SUBMITTED`

**Description**: Émis lorsque l'utilisateur soumet une URL à télécharger.

**Payload**:

```javascript
{
  url: "https://youtube.com/watch?v=...", // URL à traiter
  options: {
    format: "mp3",                        // Format souhaité
    quality: "high",                      // Qualité souhaitée
    downloadPath: "/path/to/folder"       // Chemin de destination
  }
}
```

**Émis par**: `header-component.js`

**Écouté par**: `download-manager.js`

### `UI_FORMAT_CHANGED`

**Description**: Émis lorsque l'utilisateur change le format audio préféré.

**Payload**:

```javascript
{
  format: "flac",                          // Nouveau format
  itemId: "download-123"                   // ID de l'élément (optionnel)
}
```

**Émis par**: `download-item.js`

**Écouté par**: `download-manager.js`, `format-converter.js`

### `UI_DOWNLOAD_START_REQUESTED`

**Description**: Émis lorsque l'utilisateur demande le démarrage d'un téléchargement.

**Payload**:

```javascript
{
  itemId: 'download-123'; // ID de l'élément à télécharger
}
```

**Émis par**: `download-item.js`

**Écouté par**: `download-manager.js`

### `UI_DOWNLOAD_CANCEL_REQUESTED`

**Description**: Émis lorsque l'utilisateur demande l'annulation d'un téléchargement.

**Payload**:

```javascript
{
  itemId: 'download-123'; // ID de l'élément à annuler
}
```

**Émis par**: `download-item.js`

**Écouté par**: `download-manager.js`

### `UI_DOWNLOAD_PAUSE_REQUESTED`

**Description**: Émis lorsque l'utilisateur demande la mise en pause d'un téléchargement.

**Payload**:

```javascript
{
  itemId: 'download-123'; // ID de l'élément à mettre en pause
}
```

**Émis par**: `download-item.js`

**Écouté par**: `download-manager.js`

### `UI_DOWNLOAD_RESUME_REQUESTED`

**Description**: Émis lorsque l'utilisateur demande la reprise d'un téléchargement.

**Payload**:

```javascript
{
  itemId: 'download-123'; // ID de l'élément à reprendre
}
```

**Émis par**: `download-item.js`

**Écouté par**: `download-manager.js`

### `UI_SETTINGS_OPENED`

**Description**: Émis lorsque l'utilisateur ouvre les paramètres.

**Payload**: Aucun

**Émis par**: `footer-component.js`

**Écouté par**: `ui-manager.js`, `settings-panel.js`

### `UI_SETTINGS_SAVED`

**Description**: Émis lorsque l'utilisateur sauvegarde les paramètres.

**Payload**:

```javascript
{
  settings: {
    // Nouvelles valeurs des paramètres
    downloadPath: "/path/to/folder",
    defaultFormat: "mp3",
    maxConcurrentDownloads: 3,
    // ...
  }
}
```

**Émis par**: `settings-panel.js`

**Écouté par**: `config-manager.js`

### `UI_CLEAR_COMPLETED_REQUESTED`

**Description**: Émis lorsque l'utilisateur demande la suppression des téléchargements terminés.

**Payload**: Aucun

**Émis par**: `footer-component.js`

**Écouté par**: `download-manager.js`, `ui-manager.js`

### `UI_ADD_TO_LIBRARY_REQUESTED`

**Description**: Émis lorsque l'utilisateur demande l'ajout des fichiers téléchargés à la bibliothèque musicale.

**Payload**:

```javascript
{
  itemIds: ['download-123', 'download-456']; // IDs des éléments à ajouter (optionnel)
}
```

**Émis par**: `footer-component.js`

**Écouté par**: `file-operations.js`

## Événements de téléchargement

### `DOWNLOAD_ANALYZED`

**Description**: Émis lorsqu'une URL a été analysée et que les informations sur le contenu sont disponibles.

**Payload**:

```javascript
{
  itemId: "download-123",         // ID unique généré pour ce téléchargement
  url: "https://...",            // URL originale
  platform: "youtube",           // Plateforme détectée
  isPlaylist: false,             // Indicateur de playlist
  playlistSize: 0,               // Taille de la playlist (si applicable)
  metadata: {
    // Métadonnées préliminaires (peuvent être partielles)
    title: "Titre de la piste",
    artist: "Nom de l'artiste",
    album: "Nom de l'album",
    thumbnail: "https://..."     // URL de la miniature
  }
}
```

**Émis par**: Adaptateurs de plateforme (ex: `youtube-adapter.js`)

**Écouté par**: `download-manager.js`, `ui-manager.js`

### `DOWNLOAD_QUEUED`

**Description**: Émis lorsqu'un téléchargement a été ajouté à la file d'attente.

**Payload**:

```javascript
{
  itemId: "download-123",     // ID de l'élément
  position: 3,                // Position dans la file d'attente
  estimatedStartTime: 123456, // Horodatage estimé de début (optionnel)
  metadata: {
    // Métadonnées complètes
    // ...
  }
}
```

**Émis par**: `download-queue.js`

**Écouté par**: `ui-manager.js`

### `DOWNLOAD_STARTED`

**Description**: Émis lorsqu'un téléchargement commence.

**Payload**:

```javascript
{
  itemId: "download-123",    // ID de l'élément
  startTime: 123456789,      // Horodatage de début
  estimatedSize: 12345678,   // Taille estimée en octets (optionnel)
  tempFilePath: "/tmp/..."   // Chemin du fichier temporaire
}
```

**Émis par**: `download-manager.js`

**Écouté par**: `ui-manager.js`

### `DOWNLOAD_PROGRESS`

**Description**: Émis périodiquement pour indiquer la progression d'un téléchargement.

**Payload**:

```javascript
{
  itemId: "download-123",       // ID de l'élément
  bytesDownloaded: 1234567,     // Octets téléchargés
  totalBytes: 12345678,         // Taille totale en octets (si connue)
  progress: 0.45,               // Progression (0-1)
  speed: 1024000,               // Vitesse en octets/seconde
  eta: 30                       // Temps restant estimé en secondes
}
```

**Émis par**: Adaptateurs de plateforme

**Écouté par**: `download-manager.js`, `ui-manager.js`

### `DOWNLOAD_COMPLETED`

**Description**: Émis lorsqu'un téléchargement est terminé avec succès.

**Payload**:

```javascript
{
  itemId: "download-123",      // ID de l'élément
  filePath: "/path/to/file",   // Chemin du fichier téléchargé
  duration: 45.6,              // Durée du téléchargement en secondes
  fileSize: 12345678,          // Taille du fichier en octets
  checksum: "sha256-..."       // Checksum du fichier
}
```

**Émis par**: Adaptateurs de plateforme

**Écouté par**: `download-manager.js`, `ui-manager.js`, `metadata-manager.js`

### `DOWNLOAD_FAILED`

**Description**: Émis lorsqu'un téléchargement échoue.

**Payload**:

```javascript
{
  itemId: "download-123",          // ID de l'élément
  error: {
    code: "NETWORK_ERROR",         // Code d'erreur
    message: "Connexion perdue",   // Message d'erreur
    details: { ... }               // Détails supplémentaires
  },
  attempts: 2,                     // Nombre de tentatives
  canRetry: true                   // Indique si une nouvelle tentative est possible
}
```

**Émis par**: Adaptateurs de plateforme

**Écouté par**: `download-manager.js`, `ui-manager.js`

### `DOWNLOAD_CANCELED`

**Description**: Émis lorsqu'un téléchargement est annulé par l'utilisateur.

**Payload**:

```javascript
{
  itemId: "download-123",      // ID de l'élément
  tempFilePath: "/tmp/..."     // Chemin du fichier temporaire à supprimer
}
```

**Émis par**: `download-manager.js`

**Écouté par**: `ui-manager.js`, Adaptateurs de plateforme

### `DOWNLOAD_PAUSED`

**Description**: Émis lorsqu'un téléchargement est mis en pause.

**Payload**:

```javascript
{
  itemId: "download-123",            // ID de l'élément
  resumeData: { ... },               // Données pour reprendre le téléchargement
  bytesDownloaded: 1234567,          // Octets déjà téléchargés
  progress: 0.45                     // Progression (0-1)
}
```

**Émis par**: `download-manager.js`

**Écouté par**: `ui-manager.js`, Adaptateurs de plateforme

### `DOWNLOAD_RESUMED`

**Description**: Émis lorsqu'un téléchargement en pause est repris.

**Payload**:

```javascript
{
  itemId: "download-123",       // ID de l'élément
  bytesDownloaded: 1234567,     // Octets déjà téléchargés
  progress: 0.45                // Progression (0-1)
}
```

**Émis par**: `download-manager.js`

**Écouté par**: `ui-manager.js`, Adaptateurs de plateforme

### `DOWNLOADS_CLEARED`

**Description**: Émis lorsque les téléchargements terminés sont supprimés de la liste.

**Payload**:

```javascript
{
  itemIds: ['download-123', 'download-456']; // IDs des éléments supprimés
}
```

**Émis par**: `download-manager.js`

**Écouté par**: `ui-manager.js`

## Événements d'authentification

### `AUTH_REQUIRED`

**Description**: Émis lorsqu'une authentification est nécessaire pour un service.

**Payload**:

```javascript
{
  service: "tidal",              // Nom du service
  authUrl: "https://...",        // URL d'authentification (optionnel)
  requiredScopes: ["read", "..."] // Permissions requises
}
```

**Émis par**: Adaptateurs de plateforme

**Écouté par**: `auth-manager.js`, `ui-manager.js`

### `AUTH_STARTED`

**Description**: Émis lorsque le processus d'authentification démarre.

**Payload**:

```javascript
{
  service: "tidal",           // Nom du service
  authWindowId: "window-123"  // ID de la fenêtre d'authentification
}
```

**Émis par**: `auth-manager.js`

**Écouté par**: `ui-manager.js`

### `AUTH_CODE_RECEIVED`

**Description**: Émis lorsqu'un code d'authentification est reçu.

**Payload**:

```javascript
{
  service: "tidal",           // Nom du service
  code: "auth-code-123"       // Code d'authentification
}
```

**Émis par**: `auth-manager.js`

**Écouté par**: `ui-manager.js`

### `AUTH_SUCCESS`

**Description**: Émis lorsque l'authentification est réussie.

**Payload**:

```javascript
{
  service: "tidal",           // Nom du service
  tokenInfo: {
    // Informations sur le token (sécurisées)
    expiresAt: 123456789      // Horodatage d'expiration
  }
}
```

**Émis par**: `auth-manager.js`

**Écouté par**: `ui-manager.js`, Adaptateurs de plateforme, `secure-token-store.js`

### `AUTH_FAILED`

**Description**: Émis lorsque l'authentification échoue.

**Payload**:

```javascript
{
  service: "tidal",              // Nom du service
  error: {
    code: "INVALID_CREDENTIALS", // Code d'erreur
    message: "..."               // Message d'erreur
  }
}
```

**Émis par**: `auth-manager.js`

**Écouté par**: `ui-manager.js`

### `AUTH_TOKEN_EXPIRED`

**Description**: Émis lorsqu'un token d'authentification expire.

**Payload**:

```javascript
{
  service: "tidal",      // Nom du service
  tokenInfo: {
    // Informations sur le token expiré
  }
}
```

**Émis par**: `secure-token-store.js`

**Écouté par**: `auth-manager.js`

### `AUTH_TOKEN_REFRESHED`

**Description**: Émis lorsqu'un token d'authentification est rafraîchi.

**Payload**:

```javascript
{
  service: "tidal",      // Nom du service
  tokenInfo: {
    // Nouvelles informations sur le token
    expiresAt: 123456789 // Nouvel horodatage d'expiration
  }
}
```

**Émis par**: `auth-manager.js`

**Écouté par**: `secure-token-store.js`, Adaptateurs de plateforme

## Événements de métadonnées

### `METADATA_EXTRACTION_STARTED`

**Description**: Émis lorsque l'extraction des métadonnées commence.

**Payload**:

```javascript
{
  itemId: "download-123", // ID de l'élément
  url: "https://..."     // URL source
}
```

**Émis par**: `metadata-manager.js`

**Écouté par**: `ui-manager.js`

### `METADATA_EXTRACTED`

**Description**: Émis lorsque les métadonnées sont extraites avec succès.

**Payload**:

```javascript
{
  itemId: "download-123",      // ID de l'élément
  metadata: {
    title: "Titre de la piste",
    artist: "Nom de l'artiste",
    album: "Nom de l'album",
    genre: "Genre",
    year: 2023,
    trackNumber: 5,
    totalTracks: 12,
    discNumber: 1,
    totalDiscs: 1,
    duration: 180,             // Durée en secondes
    thumbnail: "https://...",  // URL de la miniature
    lyrics: "...",             // Paroles (si disponibles)
    // Métadonnées spécifiques à la plateforme
    platform: {
      // ...
    }
  }
}
```

**Émis par**: `metadata-manager.js`

**Écouté par**: `ui-manager.js`, `tag-processor.js`

### `METADATA_EXTRACTION_FAILED`

**Description**: Émis lorsque l'extraction des métadonnées échoue.

**Payload**:

```javascript
{
  itemId: "download-123",    // ID de l'élément
  error: {
    code: "METADATA_ERROR",  // Code d'erreur
    message: "..."           // Message d'erreur
  }
}
```

**Émis par**: `metadata-manager.js`

**Écouté par**: `ui-manager.js`

### `METADATA_UPDATED`

**Description**: Émis lorsque les métadonnées sont mises à jour par l'utilisateur.

**Payload**:

```javascript
{
  itemId: "download-123",      // ID de l'élément
  metadata: {
    // Nouvelles métadonnées
    // ...
  },
  changes: ["title", "artist"] // Champs modifiés
}
```

**Émis par**: `download-item.js`

**Écouté par**: `metadata-manager.js`, `tag-processor.js`

### `TAGS_APPLIED`

**Description**: Émis lorsque les tags sont appliqués à un fichier audio.

**Payload**:

```javascript
{
  itemId: "download-123",      // ID de l'élément
  filePath: "/path/to/file",   // Chemin du fichier
  tags: {
    // Tags appliqués
    // ...
  },
  coverArt: {
    embedded: true,            // Indique si la pochette est intégrée
    path: "/path/to/cover"     // Chemin de la pochette (si applicable)
  }
}
```

**Émis par**: `tag-processor.js`

**Écouté par**: `ui-manager.js`

## Événements de conversion

### `CONVERSION_STARTED`

**Description**: Émis lorsque la conversion d'un fichier commence.

**Payload**:

```javascript
{
  itemId: "download-123",      // ID de l'élément
  sourceFormat: "webm",        // Format source
  targetFormat: "mp3",         // Format cible
  options: {
    bitrate: "320k",           // Bitrate (pour les formats compressés)
    sampleRate: "44.1kHz",     // Taux d'échantillonnage
    channels: 2                // Nombre de canaux
  }
}
```

**Émis par**: `format-converter.js`

**Écouté par**: `ui-manager.js`

### `CONVERSION_PROGRESS`

**Description**: Émis périodiquement pour indiquer la progression d'une conversion.

**Payload**:

```javascript
{
  itemId: "download-123",   // ID de l'élément
  progress: 0.75,           // Progression (0-1)
  estimatedTimeLeft: 15     // Temps restant estimé en secondes
}
```

**Émis par**: `format-converter.js`

**Écouté par**: `ui-manager.js`

### `CONVERSION_COMPLETED`

**Description**: Émis lorsque la conversion est terminée avec succès.

**Payload**:

```javascript
{
  itemId: "download-123",          // ID de l'élément
  originalFilePath: "/path/...",   // Chemin du fichier original
  convertedFilePath: "/path/...",  // Chemin du fichier converti
  targetFormat: "mp3",             // Format cible
  stats: {
    duration: 5.2,                 // Durée de la conversion en secondes
    originalSize: 12345678,        // Taille du fichier original en octets
    convertedSize: 2345678         // Taille du fichier converti en octets
  }
}
```

**Émis par**: `format-converter.js`

**Écouté par**: `ui-manager.js`, `download-manager.js`

### `CONVERSION_FAILED`

**Description**: Émis lorsque la conversion échoue.

**Payload**:

```javascript
{
  itemId: "download-123",        // ID de l'élément
  sourceFormat: "webm",          // Format source
  targetFormat: "mp3",           // Format cible
  error: {
    code: "CONVERSION_ERROR",    // Code d'erreur
    message: "...",              // Message d'erreur
    details: { ... }             // Détails supplémentaires
  }
}
```

**Émis par**: `format-converter.js`

**Écouté par**: `ui-manager.js`, `error-handler.js`

## Événements de configuration

### `CONFIG_REQUESTED`

**Description**: Émis lorsqu'un module demande les paramètres de configuration.

**Payload**:

```javascript
{
  keys: ["downloadPath", "defaultFormat"], // Clés demandées (optionnel)
  moduleId: "download-manager"             // ID du module demandeur
}
```

**Émis par**: Tous les modules

**Écouté par**: `config-manager.js`

### `CONFIG_PROVIDED`

**Description**: Émis en réponse à une demande de configuration.

**Payload**:

```javascript
{
  config: {
    // Configuration demandée
    downloadPath: "/path/to/folder",
    defaultFormat: "mp3"
  },
  moduleId: "download-manager" // ID du module demandeur
}
```

**Émis par**: `config-manager.js`

**Écouté par**: Tous les modules

### `CONFIG_UPDATED`

**Description**: Émis lorsque la configuration est mise à jour.

**Payload**:

```javascript
{
  changes: {
    // Modifications apportées
    downloadPath: "/new/path",
    defaultFormat: "flac"
  },
  source: "settings-panel" // Source de la mise à jour
}
```

**Émis par**: `config-manager.js`

**Écouté par**: Tous les modules

## Événements d'erreurs

### `ERROR`

**Description**: Événement générique pour les erreurs.

**Payload**:

```javascript
{
  code: "ERROR_CODE",            // Code d'erreur standardisé
  message: "Message d'erreur",   // Message descriptif
  details: { ... },              // Détails supplémentaires
  source: "module-id",           // Source de l'erreur
  severity: "critical",          // Gravité: info, warning, error, critical
  timestamp: 123456789,          // Horodatage
  correlationId: "uuid-v4"       // ID de corrélation pour le traçage
}
```

**Émis par**: Tous les modules

**Écouté par**: `error-handler.js`, `ui-manager.js`, `event-logger.js`

### `ERROR_RESOLVED`

**Description**: Émis lorsqu'une erreur est résolue.

**Payload**:

```javascript
{
  originalError: {
    // Erreur originale
    code: "ERROR_CODE",
    // ...
  },
  resolution: {
    type: "AUTOMATIC_RETRY",     // Type de résolution
    details: { ... }             // Détails sur la résolution
  }
}
```

**Émis par**: `error-handler.js`

**Écouté par**: `ui-manager.js`, `event-logger.js`

## Bonnes pratiques d'utilisation des événements

1. **Nommage cohérent**: Tous les types d'événements doivent utiliser des constantes définies dans `constants/event-types.js`.

2. **Horodatage**: Toujours inclure un horodatage `timestamp` dans les métadonnées.

3. **Corrélation**: Utiliser des IDs de corrélation pour suivre les flux d'événements liés.

4. **Typage**: Respecter strictement la structure de données définie pour chaque événement.

5. **Documentation**: Documenter les nouveaux événements dans ce fichier.

6. **Isolation**: Ne pas faire de suppositions sur les modules qui écoutent vos événements.

7. **Idempotence**: Les événements doivent pouvoir être traités plusieurs fois sans effets secondaires.

8. **Granularité**: Préférer plusieurs événements spécifiques à un seul événement générique.

## Extension du système d'événements

Pour ajouter un nouvel événement:

1. Définir une constante dans `constants/event-types.js`
2. Documenter l'événement dans ce fichier
3. Implémenter l'émission et la réception dans les modules concernés
4. Ajouter des tests pour vérifier le bon fonctionnement

## Débogage des événements

Tous les événements sont automatiquement journalisés par le module `event-logger.js`. Pour activer la journalisation détaillée pendant le développement, définir la variable d'environnement:

```
DEBUG_EVENTS=true
```

Le journal des événements peut être consulté dans la console de développement ou exporté pour analyse.
