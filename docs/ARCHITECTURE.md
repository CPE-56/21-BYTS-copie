# ARCHITECTURE DE 21 BYTS

## Vue d'ensemble

21 BYTS est une application de bureau multiplateforme (Mac/Windows/Linux) permettant de télécharger des fichiers audio depuis diverses plateformes de streaming telles que YouTube, Bandcamp, SoundCloud, Spotify et Tidal. L'application est construite sur Electron pour garantir la compatibilité entre les systèmes d'exploitation et utilise une architecture modulaire basée sur des événements pour maximiser la flexibilité et la maintenabilité.

## Principes architecturaux fondamentaux

### 1. Architecture événementielle pure

Tous les modules communiquent **exclusivement** via un bus d'événements central (`event-bus.js`). Cette approche garantit un couplage faible entre les composants et permet de remplacer n'importe quel module sans affecter le reste du système. Aucune importation directe entre les modules n'est autorisée.

### 2. Modules autonomes ("Single File Components")

Chaque fichier gère une fonctionnalité autonome et spécifique, sans dépendances circulaires. Les modules sont conçus pour être testés individuellement et peuvent être remplacés par d'autres implémentations tant que l'interface événementielle est respectée.

### 3. Injection de dépendances

Les dépendances sont injectées via le conteneur d'application (`app-container.js`) plutôt que d'être directement importées, ce qui facilite les tests et la modularité.

### 4. Gestion centralisée des erreurs et des événements

Toutes les erreurs sont capturées et publiées via le bus d'événements, ce qui permet une gestion cohérente et centralisée des erreurs à travers l'application.

## Structure du projet

```
/21-byts
  /src
    /core               # Composants fondamentaux de l'architecture
    /modules            # Modules fonctionnels de l'application
    /utils              # Utilitaires partagés
    /constants          # Constantes globales
    /assets             # Ressources statiques
    /styles             # Styles CSS
    main.js             # Point d'entrée Electron
    preload.js          # Script de préchargement
  /tests                # Tests unitaires et d'intégration
  /build                # Scripts de build spécifiques à chaque OS
  /docs                 # Documentation du projet
  package.json
  electron-builder.json
```

## Composants fondamentaux (Core)

### Bus d'événements (event-bus.js)

Le bus d'événements est la colonne vertébrale de l'application. Il implémente le pattern d'abonnement/publication (pub/sub) et permet à tous les modules de communiquer sans dépendances directes.

Caractéristiques:

- Publication et abonnement aux événements
- Traçabilité des événements (pour le débogage)
- Gestion de la propagation des événements
- Support pour les événements asynchrones

### Conteneur d'application (app-container.js)

Implémente un système d'injection de dépendances léger qui permet de:

- Enregistrer des services/modules
- Résoudre des dépendances à l'exécution
- Gérer le cycle de vie des modules

### Gestionnaire de configuration (config-manager.js)

Gère les paramètres et la configuration de l'application:

- Chargement/Sauvegarde des préférences utilisateur
- Valeurs par défaut pour la configuration
- Événements de changement de configuration

### Gestionnaire d'erreurs (error-handler.js)

Centralise la gestion des erreurs:

- Capture et journalisation des erreurs
- Classification des erreurs selon leur type
- Publication d'événements d'erreur
- Stratégies de récupération

### Journal d'événements (event-logger.js)

Journalise les événements pour le débogage et l'analyse:

- Enregistrement chronologique des événements
- Filtrage des événements par type
- Exportation des journaux

### Gestionnaire d'état (state-manager.js)

Maintient l'état global de l'application:

- Stockage de l'état centralisé
- Modifications de l'état via des événements
- Notifications de changement d'état

## Modules fonctionnels

### Module de téléchargement

Responsable de la gestion des téléchargements audio:

#### Gestionnaire de téléchargement (download-manager.js)

- Coordonne les opérations de téléchargement
- Gestion des erreurs et des reprises
- Publication des événements de progression et d'achèvement

#### File d'attente de téléchargement (download-queue.js)

- Priorisation des téléchargements
- Limitation du nombre de téléchargements simultanés
- Pause/Reprise des téléchargements

#### Adaptateurs de plateforme

Chaque plateforme (YouTube, Spotify, etc.) a son propre adaptateur qui:

- Implémente l'extraction spécifique à la plateforme
- Convertit les URL en métadonnées et liens de téléchargement
- Gère les particularités de chaque service

### Module d'interface utilisateur (UI)

Gère l'affichage et les interactions utilisateur:

#### Gestionnaire d'UI (ui-manager.js)

- Coordination des composants d'interface
- Réaction aux événements système

#### Composants d'interface

- Composants indépendants pour chaque partie de l'interface
- Communication via événements uniquement
- Support pour les thèmes clairs/sombres

### Module d'authentification

Gère les authentifications pour les services nécessitant des identifiants:

#### Gestionnaire d'authentification (auth-manager.js)

- Processus d'authentification OAuth
- Rafraîchissement des tokens

#### Stockage sécurisé des tokens (secure-token-store.js)

- Chiffrement AES-256 des informations sensibles
- Stockage local sécurisé

### Module de métadonnées

Traite les métadonnées des fichiers audio:

#### Gestionnaire de métadonnées (metadata-manager.js)

- Extraction des métadonnées des sources
- Formatage et normalisation

#### Processeur de tags (tag-processor.js)

- Application des métadonnées aux fichiers téléchargés
- Gestion des pochettes d'album

### Module de formats

Gère la conversion entre formats audio:

#### Convertisseur de format (format-converter.js)

- Conversion vers MP3, WAV, FLAC, AIFF
- Options de qualité configurable

## Flux de données et interaction entre modules

1. L'utilisateur entre une URL dans l'interface
2. Le composant UI publie un événement `URL_SUBMITTED`
3. Le gestionnaire de téléchargement reçoit cet événement et:
   - Détermine le type de plateforme (YouTube, Spotify, etc.)
   - Délègue à l'adaptateur approprié
4. L'adaptateur analyse l'URL et publie un événement `METADATA_EXTRACTED`
5. Le gestionnaire de métadonnées enrichit ces données et publie `METADATA_PROCESSED`
6. Le gestionnaire de téléchargement ajoute l'élément à la file d'attente et publie `DOWNLOAD_QUEUED`
7. L'UI met à jour l'affichage pour montrer l'élément en file d'attente
8. Quand le téléchargement commence, un événement `DOWNLOAD_STARTED` est publié
9. Des événements de progression (`DOWNLOAD_PROGRESS`) sont publiés pendant le téléchargement
10. Une fois terminé, un événement `DOWNLOAD_COMPLETED` est publié
11. Le convertisseur de format traite le fichier si nécessaire
12. Le processeur de tags applique les métadonnées au fichier final
13. L'UI est mise à jour pour refléter l'achèvement

## Gestion des erreurs

Toutes les erreurs sont publiées sur le bus d'événements avec un type `ERROR` et un code spécifique. Le gestionnaire d'erreurs centralisé:

1. Journalise l'erreur
2. Détermine la gravité
3. Publie un événement approprié pour l'UI
4. Applique une stratégie de récupération si possible

## Tests

L'architecture facilite les tests unitaires et d'intégration:

- Chaque module peut être testé individuellement
- Les tests d'intégration utilisent des simulateurs (mocks) pour les modules externes
- Le bus d'événements peut être surveillé pour vérifier les interactions attendues

## Extensibilité

Pour ajouter une nouvelle fonctionnalité:

1. Créer un nouveau module autonome
2. S'abonner aux événements pertinents
3. Publier de nouveaux événements si nécessaire

Pour ajouter le support d'une nouvelle plateforme:

1. Créer un nouvel adaptateur
2. L'enregistrer dans la fabrique d'adaptateurs

## Sécurité

- Toutes les données sensibles sont chiffrées avec AES-256
- Les identifiants ne sont jamais stockés en clair
- Les tokens d'authentification sont stockés de manière sécurisée
- Vérification des checksums pour garantir l'intégrité des fichiers téléchargés

## Mise à jour automatique

L'application inclut un système de mise à jour automatique via Electron AutoUpdater qui:

- Vérifie les mises à jour au démarrage
- Télécharge et installe silencieusement les nouvelles versions
- Offre une option de fallback en cas d'échec

## Conclusion

Cette architecture modulaire basée sur les événements offre:

- Une excellente séparation des préoccupations
- Une facilité de maintenance et d'extension
- Une robustesse face aux erreurs
- Une compatibilité multiplateforme

Elle permet également aux développeurs d'ajouter, de modifier ou de remplacer des modules sans impacter le reste du système, tant que l'interface événementielle est respectée.
