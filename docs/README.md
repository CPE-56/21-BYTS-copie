# 21 BYTS - Téléchargeur Audio Multiplateforme

[![Core Module Tests](https://github.com/CPE-56/21-BYTS-copie/actions/workflows/test.yml/badge.svg)](https://github.com/CPE-56/21-BYTS-copie/actions/workflows/test.yml)

![Logo 21 BYTS](./src/assets/images/logo.png)

## Présentation

21 BYTS est une application de bureau moderne permettant de télécharger des fichiers audio depuis diverses plateformes de streaming (YouTube, Bandcamp, SoundCloud, Spotify, Tidal, etc.) en haute qualité. Elle offre une interface utilisateur intuitive et des performances optimisées sur Mac, Windows et Linux.

## ⚠️ Avertissement légal

**VEUILLEZ LIRE ATTENTIVEMENT :**

* **Usage privé uniquement** : Cette application est destinée exclusivement à un usage personnel et privé.
* **Nécessite un abonnement Tidal** : Pour accéder aux fonctionnalités Tidal, vous devez posséder un abonnement valide.
* **Respect des droits d'auteur** : N'utilisez pas cette application pour distribuer ou pirater de la musique protégée par le droit d'auteur.
* **Légalité variable** : L'utilisation de ce type d'outil peut être illégale dans votre pays, veuillez vous renseigner sur la législation locale avant utilisation.

Les développeurs de 21 BYTS ne sont pas responsables de l'utilisation abusive de cette application. Tout contenu téléchargé reste sous la responsabilité de l'utilisateur final.

## Fonctionnalités principales

* Téléchargement depuis plusieurs plateformes : YouTube, Bandcamp, SoundCloud, Spotify, Tidal
* Interface utilisateur moderne et intuitive
* Conversion en plusieurs formats audio de haute qualité (MP3 320kbps, WAV, FLAC, AIFF)
* Gestion intelligente des métadonnées (titre, artiste, album, pochette)
* Prise en charge des playlists (jusqu'à 200 titres)
* Authentification sécurisée pour Tidal avec OAuth
* Mises à jour automatiques

## Installation

### Prérequis

* Node.js 16 ou supérieur
* FFmpeg (installé automatiquement par l'application)
* yt-dlp (installé automatiquement par l'application)

### Téléchargement

Téléchargez la dernière version depuis la [page des releases](https://github.com/CPE-56/21-BYTS-copie/releases).

### Installation

#### macOS

1. Ouvrez le fichier `.dmg`
2. Glissez l'application dans votre dossier Applications
3. Au premier lancement, faites un clic droit et sélectionnez "Ouvrir" pour contourner la protection Gatekeeper

#### Windows

1. Exécutez le fichier `.exe`
2. Suivez les instructions d'installation
3. L'application sera disponible dans le menu Démarrer

#### Linux

1. Téléchargez le fichier `.AppImage` ou `.deb` selon votre distribution
2. Pour AppImage :

   * Rendez le fichier exécutable avec `chmod +x 21BYTS-x.x.x.AppImage`
   * Exécutez le fichier `./21BYTS-x.x.x.AppImage`
3. Pour le paquet Debian :

   * Installez avec `sudo dpkg -i 21BYTS-x.x.x.deb`
   * Lancez depuis le menu des applications

## Guide d'utilisation rapide

1. **Ajouter un lien** : Cliquez sur le bouton "+" ou collez directement une URL
2. **Choisir le format** : Sélectionnez MP3, WAV, FLAC ou AIFF dans le menu déroulant
3. **Télécharger** : Cliquez sur l'icône de téléchargement pour démarrer
4. **Bibliothèque** : Ajoutez les fichiers téléchargés à votre bibliothèque musicale avec le bouton dédié

## Architecture technique

21 BYTS est construit sur une architecture événementielle modulaire :

* **Frontend** : HTML/CSS/JavaScript avec des composants isolés
* **Backend** : Node.js et Electron pour l'accès système
* **Communication** : Bus d'événements central pour découpler les modules
* **Structure** : Architecture "Single File Components" pour une maintenance facilitée

## Contribuer

### Configuration de l'environnement de développement

1. Clonez le dépôt :

```bash
git clone https://github.com/CPE-56/21-BYTS-copie.git
cd 21-BYTS-copie
```

2. Installez les dépendances :

```bash
npm install
```

3. Lancez l'application en mode développement :

```bash
npm run dev
```

### Principes de développement

* Respectez l'architecture événementielle
* Chaque fichier doit être autonome et communiquer uniquement via le bus d'événements
* Documentez tous les événements émis et écoutés
* Suivez les conventions de codage décrites dans DEVELOPMENT.md

## Licence

Ce projet est distribué sous licence MIT modifiée. Voir le fichier LICENSE pour plus de détails.

---

Développé avec soin, passion et une bonne dose de café ☕ par l'équipe 21 BYTS.
