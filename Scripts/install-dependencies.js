#!/usr/bin/env node

/**
 * @file install-dependencies.js
 * @description Vérifie la présence de dépendances système essentielles pour 21 BYTS (ffmpeg, yt-dlp).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function isCommandAvailable(command) {
  try {
    execSync(`${command} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function logStatus(name, available) {
  if (available) {
    console.log(`✅ ${name} détecté`);
  } else {
    console.warn(`⚠️  ${name} non trouvé. Veuillez l’installer manuellement.`);
  }
}

function main() {
  console.log('🔍 Vérification des dépendances système...');

  const deps = ['ffmpeg', 'yt-dlp'];

  deps.forEach((dep) => {
    const available = isCommandAvailable(dep);
    logStatus(dep, available);
  });

  console.log('📦 Vérification terminée.');
}

main();
