#!/bin/bash

# Script de création automatique de structure de dossiers et fichiers
# Pour le projet 21-byts

# Définir le répertoire de base (par défaut le répertoire courant)
BASE_DIR="$(pwd)/21-byts"

# Fonction pour créer un fichier avec commentaire
create_file_with_comment() {
    local file_path="$1"
    local comment="$2"

    # Créer le répertoire parent si nécessaire
    mkdir -p "$(dirname "$file_path")"

    # Créer le fichier avec commentaire
    echo "// $comment" > "$file_path"
    echo "// Créé automatiquement le $(date +"%Y-%m-%d")" >> "$file_path"
    echo "" >> "$file_path"

    echo "Fichier créé: $file_path"
}

# Fonction pour créer un fichier markdown
create_md_file() {
    local file_path="$1"
    local title="$2"
    local description="$3"

    # Créer le répertoire parent si nécessaire
    mkdir -p "$(dirname "$file_path")"

    # Créer le fichier markdown
    echo "# $title" > "$file_path"
    echo "" >> "$file_path"
    echo "$description" >> "$file_path"
    echo "" >> "$file_path"
    echo "Créé automatiquement le $(date +"%Y-%m-%d")" >> "$file_path"

    echo "Fichier markdown créé: $file_path"
}

# Fonction pour créer un fichier CSS
create_css_file() {
    local file_path="$1"
    local comment="$2"

    # Créer le répertoire parent si nécessaire
    mkdir -p "$(dirname "$file_path")"

    # Créer le fichier CSS
    echo "/* $comment */" > "$file_path"
    echo "/* Créé automatiquement le $(date +"%Y-%m-%d") */" >> "$file_path"
    echo "" >> "$file_path"

    echo "Fichier CSS créé: $file_path"
}

# Fonction pour créer un fichier JSON
create_json_file() {
    local file_path="$1"
    local content="$2"

    # Créer le répertoire parent si nécessaire
    mkdir -p "$(dirname "$file_path")"

    # Créer le fichier JSON
    echo "$content" > "$file_path"

    echo "Fichier JSON créé: $file_path"
}

echo "Création de la structure de dossiers et fichiers pour 21-byts..."
mkdir -p "$BASE_DIR"

# Créer la structure de dossiers et fichiers core
create_file_with_comment "$BASE_DIR/src/core/event-bus.js" "Bus d'événements amélioré avec traçabilité"
create_file_with_comment "$BASE_DIR/src/core/app-container.js" "Conteneur d'application avec injection de dépendances"
create_file_with_comment "$BASE_DIR/src/core/config-manager.js" "Gestionnaire de configuration"
create_file_with_comment "$BASE_DIR/src/core/error-handler.js" "Gestionnaire d'erreurs centralisé"
create_file_with_comment "$BASE_DIR/src/core/event-logger.js" "Journalisation des événements"
create_file_with_comment "$BASE_DIR/src/core/state-manager.js" "Gestionnaire d'état centralisé"

# Créer la structure de dossiers et fichiers modules/download
create_file_with_comment "$BASE_DIR/src/modules/download/download-manager.js" "Gestionnaire principal de téléchargement"
create_file_with_comment "$BASE_DIR/src/modules/download/download-queue.js" "File d'attente optimisée"
create_file_with_comment "$BASE_DIR/src/modules/download/adapters/adapter-factory.js" "Fabrique d'adaptateurs"
create_file_with_comment "$BASE_DIR/src/modules/download/adapters/base-adapter.js" "Classe de base pour tous les adaptateurs"
create_file_with_comment "$BASE_DIR/src/modules/download/adapters/youtube-adapter.js" "Adaptateur pour YouTube"
create_file_with_comment "$BASE_DIR/src/modules/download/adapters/soundcloud-adapter.js" "Adaptateur pour SoundCloud"
create_file_with_comment "$BASE_DIR/src/modules/download/adapters/bandcamp-adapter.js" "Adaptateur pour Bandcamp"
create_file_with_comment "$BASE_DIR/src/modules/download/adapters/spotify-adapter.js" "Adaptateur pour Spotify"
create_file_with_comment "$BASE_DIR/src/modules/download/adapters/tidal-adapter.js" "Adaptateur pour Tidal"

# Créer la structure de dossiers et fichiers modules/ui
create_file_with_comment "$BASE_DIR/src/modules/ui/ui-manager.js" "Gestionnaire principal de l'UI"
create_file_with_comment "$BASE_DIR/src/modules/ui/components/component-registry.js" "Registre central des composants"
create_file_with_comment "$BASE_DIR/src/modules/ui/components/header-component.js" "Composant d'en-tête"
create_file_with_comment "$BASE_DIR/src/modules/ui/components/download-item.js" "Composant d'élément de téléchargement"
create_file_with_comment "$BASE_DIR/src/modules/ui/components/footer-component.js" "Composant de pied de page"
create_file_with_comment "$BASE_DIR/src/modules/ui/components/settings-panel.js" "Panneau de paramètres"
create_file_with_comment "$BASE_DIR/src/modules/ui/components/error-dialog.js" "Dialogue d'erreur unifié"

# Créer la structure de dossiers et fichiers modules/auth
create_file_with_comment "$BASE_DIR/src/modules/auth/auth-manager.js" "Gestionnaire d'authentification"
create_file_with_comment "$BASE_DIR/src/modules/auth/secure-token-store.js" "Stockage sécurisé des tokens"

# Créer la structure de dossiers et fichiers modules/metadata
create_file_with_comment "$BASE_DIR/src/modules/metadata/metadata-manager.js" "Gestionnaire de métadonnées"
create_file_with_comment "$BASE_DIR/src/modules/metadata/tag-processor.js" "Traitement des tags"

# Créer la structure de dossiers et fichiers modules/formats
create_file_with_comment "$BASE_DIR/src/modules/formats/format-converter.js" "Conversion entre formats audio"

# Créer la structure de dossiers et fichiers utils
create_file_with_comment "$BASE_DIR/src/utils/file-operations.js" "Opérations sur les fichiers"
create_file_with_comment "$BASE_DIR/src/utils/crypto-utils.js" "Utilitaires de cryptographie"
create_file_with_comment "$BASE_DIR/src/utils/platform-detector.js" "Détection de la plateforme OS"
create_file_with_comment "$BASE_DIR/src/utils/playlist-handler.js" "Traitement des playlists"
create_file_with_comment "$BASE_DIR/src/utils/async-queue.js" "File d'attente pour opérations asynchrones"
create_file_with_comment "$BASE_DIR/src/utils/event-throttler.js" "Limiteur d'événements pour éviter la surcharge"

# Créer la structure de dossiers et fichiers constants
create_file_with_comment "$BASE_DIR/src/constants/event-types.js" "Liste exhaustive de tous les types d'événements"
create_file_with_comment "$BASE_DIR/src/constants/error-codes.js" "Codes d'erreur standardisés"
create_file_with_comment "$BASE_DIR/src/constants/config-defaults.js" "Valeurs par défaut pour la configuration"

# Créer les dossiers assets
mkdir -p "$BASE_DIR/src/assets/icons"
mkdir -p "$BASE_DIR/src/assets/images"

# Créer la structure de dossiers et fichiers styles
create_css_file "$BASE_DIR/src/styles/main.css" "Styles principaux de l'application"
create_css_file "$BASE_DIR/src/styles/themes.css" "Thèmes de l'application"

# Créer les fichiers racine src
create_file_with_comment "$BASE_DIR/src/main.js" "Point d'entrée Electron"
create_file_with_comment "$BASE_DIR/src/preload.js" "Script de préchargement"

# Créer la structure de dossiers tests
mkdir -p "$BASE_DIR/tests/unit"
mkdir -p "$BASE_DIR/tests/integration"
mkdir -p "$BASE_DIR/tests/mocks"

# Créer la structure de dossiers build
create_file_with_comment "$BASE_DIR/build/mac.js" "Configuration de build pour macOS"
create_file_with_comment "$BASE_DIR/build/windows.js" "Configuration de build pour Windows"
create_file_with_comment "$BASE_DIR/build/linux.js" "Configuration de build pour Linux"

# Créer la structure de dossiers docs
create_md_file "$BASE_DIR/docs/README.md" "21-byts" "Documentation principale du projet 21-byts"
create_md_file "$BASE_DIR/docs/ARCHITECTURE.md" "Architecture" "Description détaillée de l'architecture du projet"
create_md_file "$BASE_DIR/docs/EVENTS.md" "Événements" "Documentation de tous les événements du système"
create_md_file "$BASE_DIR/docs/MODULES.md" "Modules" "Documentation des modules du projet"
create_md_file "$BASE_DIR/docs/DEVELOPMENT.md" "Guide de développement" "Guide pour les développeurs du projet"

# Créer les fichiers racine
cat > "$BASE_DIR/package.json" << EOL
{
  "name": "21-byts",
  "version": "1.0.0",
  "description": "Application de téléchargement audio multi-plateforme",
  "main": "src/main.js",
  "scripts": {
    "start": "electron .",
    "test": "jest"
  },
  "author": "",
  "license": "MIT"
}
EOL

cat > "$BASE_DIR/.gitignore" << EOL
node_modules/
.DS_Store
dist/
coverage/
.env
EOL

cat > "$BASE_DIR/electron-builder.json" << EOL
{
  "appId": "com.example.21byts",
  "productName": "21-byts",
  "directories": {
    "output": "dist"
  },
  "files": [
    "src/**/*",
    "package.json"
  ],
  "mac": {
    "target": ["dmg", "zip"]
  },
  "win": {
    "target": ["nsis", "portable"]
  },
  "linux": {
    "target": ["AppImage", "deb"]
  }
}
EOL

echo "Structure de dossiers et fichiers créée avec succès dans $BASE_DIR"
