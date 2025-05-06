/**
 * @fileoverview Utilitaires de cryptographie pour l'application 21 BYTS
 *
 * Ce module fournit des fonctionnalités de chiffrement/déchiffrement sécurisé
 * des données sensibles de l'application. Il utilise l'API crypto native de Node.js
 * et implémente les standards de sécurité modernes (AES-256-GCM).
 *
 * Conformément à l'architecture "Single File Component", ce module ne dépend
 * d'aucun autre module interne du projet et communique exclusivement via
 * le bus d'événements.
 *
 * @module utils/crypto-utils
 *
 * @events
 * ÉCOUTE:
 * - CONFIG_LOADED: Reçoit la clé de chiffrement stockée dans la configuration
 * - ENCRYPT_DATA: Demande de chiffrement de données
 * - DECRYPT_DATA: Demande de déchiffrement de données
 * - GENERATE_KEY: Demande de génération d'une nouvelle clé
 * - HASH_DATA: Demande de hachage de données
 * - VERIFY_HASH: Demande de vérification d'un hachage
 * - GENERATE_TOKEN: Demande de génération d'un token sécurisé
 *
 * ÉMET:
 * - ENCRYPT_DATA_RESULT: Résultat du chiffrement de données
 * - DECRYPT_DATA_RESULT: Résultat du déchiffrement de données
 * - GENERATE_KEY_RESULT: Résultat de la génération de clé
 * - HASH_DATA_RESULT: Résultat du hachage de données
 * - VERIFY_HASH_RESULT: Résultat de la vérification d'un hachage
 * - GENERATE_TOKEN_RESULT: Résultat de la génération de token
 * - ERROR: Erreur survenue dans le module
 */

'use strict';

// Dépendances standard de Node.js
const crypto = require('crypto');

/**
 * CryptoUtils - Module d'utilitaires de cryptographie
 */
function CryptoUtils() {
  // Configuration par défaut
  const DEFAULT_CONFIG = {
    algorithm: 'aes-256-gcm',
    hashAlgorithm: 'sha256',
    saltBytes: 16,
    ivBytes: 12,
    keyBytes: 32,
    iterations: 100000,
    digestEncoding: 'hex'
  };

  // Configuration du module
  let config = { ...DEFAULT_CONFIG };

  // Clé principale de chiffrement (chargée depuis la configuration)
  let masterKey = null;

  // Bus d'événements
  let eventBus = null;

  // Référence aux types d'événements standardisés
  let EVENT_TYPES = null;

  /**
   * Initialise le module
   * @param {Object} injectedEventBus - Le bus d'événements à utiliser
   * @param {Object} eventTypes - Types d'événements standardisés
   */
  function initialize(injectedEventBus, eventTypes) {
    if (!injectedEventBus) {
      throw new Error("Le bus d'événements est requis pour initialiser crypto-utils");
    }

    eventBus = injectedEventBus;
    EVENT_TYPES = eventTypes;

    // S'abonner aux événements pertinents
    registerEventListeners();

    // Notifier que le module est prêt
    eventBus.publish(EVENT_TYPES.LOG.INFO, {
      source: 'crypto-utils',
      message: 'Module crypto-utils initialisé'
    });
  }

  /**
   * Enregistre les écouteurs d'événements
   */
  function registerEventListeners() {
    // Recevoir la clé de chiffrement depuis la configuration
    eventBus.subscribe(EVENT_TYPES.CONFIG.LOADED, handleConfigLoaded);

    // Événements liés aux opérations cryptographiques
    eventBus.subscribe(EVENT_TYPES.ENCRYPT_DATA, handleEncryptData);
    eventBus.subscribe(EVENT_TYPES.DECRYPT_DATA, handleDecryptData);
    eventBus.subscribe(EVENT_TYPES.GENERATE_KEY, handleGenerateKey);
    eventBus.subscribe(EVENT_TYPES.HASH_DATA, handleHashData);
    eventBus.subscribe(EVENT_TYPES.VERIFY_HASH, handleVerifyHash);
    eventBus.subscribe(EVENT_TYPES.GENERATE_TOKEN, handleGenerateToken);
  }

  /**
   * Gère l'événement de configuration chargée
   * @param {Object} configData - Données de configuration
   */
  function handleConfigLoaded(configData) {
    if (configData && configData.security && configData.security.encryptionKey) {
      masterKey = Buffer.from(configData.security.encryptionKey, 'hex');
    } else {
      // Si pas de clé dans la config, en générer une nouvelle
      generateNewMasterKey();
    }

    // Mettre à jour la configuration si présente
    if (configData && configData.security) {
      if (configData.security.encryptionAlgorithm) {
        config.algorithm = configData.security.encryptionAlgorithm;
      }

      if (configData.security.hashAlgorithm) {
        config.hashAlgorithm = configData.security.hashAlgorithm;
      }

      if (configData.security.pbkdfIterations) {
        config.iterations = configData.security.pbkdfIterations;
      }
    }
  }

  /**
   * Génère une nouvelle clé maître et demande sa sauvegarde
   */
  function generateNewMasterKey() {
    try {
      masterKey = crypto.randomBytes(config.keyBytes);

      // Demander la sauvegarde de la nouvelle clé
      eventBus.publish(EVENT_TYPES.CONFIG.CHANGE_REQUEST, {
        key: 'security.encryptionKey',
        value: masterKey.toString('hex')
      });

      eventBus.publish(EVENT_TYPES.LOG.INFO, {
        source: 'crypto-utils',
        message: 'Nouvelle clé de chiffrement générée'
      });
    } catch (error) {
      publishError('KEY_GENERATION_FAILED', error);
    }
  }

  /**
   * Gère une demande de chiffrement de données
   * @param {Object} data - Données à chiffrer et métadonnées
   */
  function handleEncryptData(data) {
    if (!data || !data.requestId) {
      publishError('INVALID_REQUEST', new Error('Requête invalide: ID requis'));
      return;
    }

    try {
      if (!masterKey) {
        throw new Error('Clé de chiffrement non initialisée');
      }

      if (!data.payload) {
        throw new Error('Données à chiffrer non fournies');
      }

      const result = encryptData(data.payload, data.additionalData);

      eventBus.publish(EVENT_TYPES.ENCRYPT_DATA_RESULT, {
        requestId: data.requestId,
        success: true,
        encrypted: result
      });
    } catch (error) {
      publishError('ENCRYPTION_FAILED', error);

      eventBus.publish(EVENT_TYPES.ENCRYPT_DATA_RESULT, {
        requestId: data.requestId,
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Gère une demande de déchiffrement de données
   * @param {Object} data - Données à déchiffrer et métadonnées
   */
  function handleDecryptData(data) {
    if (!data || !data.requestId) {
      publishError('INVALID_REQUEST', new Error('Requête invalide: ID requis'));
      return;
    }

    try {
      if (!masterKey) {
        throw new Error('Clé de chiffrement non initialisée');
      }

      if (!data.encrypted) {
        throw new Error('Données chiffrées non fournies');
      }

      const result = decryptData(data.encrypted, data.additionalData);

      eventBus.publish(EVENT_TYPES.DECRYPT_DATA_RESULT, {
        requestId: data.requestId,
        success: true,
        decrypted: result
      });
    } catch (error) {
      publishError('DECRYPTION_FAILED', error);

      eventBus.publish(EVENT_TYPES.DECRYPT_DATA_RESULT, {
        requestId: data.requestId,
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Gère une demande de génération de clé
   * @param {Object} data - Paramètres pour la génération de clé
   */
  function handleGenerateKey(data) {
    if (!data || !data.requestId) {
      publishError('INVALID_REQUEST', new Error('Requête invalide: ID requis'));
      return;
    }

    try {
      const keySize = data.keySize || config.keyBytes;
      const key = crypto.randomBytes(keySize);

      eventBus.publish(EVENT_TYPES.GENERATE_KEY_RESULT, {
        requestId: data.requestId,
        success: true,
        key: key.toString('hex'),
        format: 'hex'
      });
    } catch (error) {
      publishError('KEY_GENERATION_FAILED', error);

      eventBus.publish(EVENT_TYPES.GENERATE_KEY_RESULT, {
        requestId: data.requestId,
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Gère une demande de hachage de données
   * @param {Object} data - Données à hacher et paramètres
   */
  function handleHashData(data) {
    if (!data || !data.requestId) {
      publishError('INVALID_REQUEST', new Error('Requête invalide: ID requis'));
      return;
    }

    try {
      if (!data.payload) {
        throw new Error('Données à hacher non fournies');
      }

      const algorithm = data.algorithm || config.hashAlgorithm;
      const salt = data.salt ? Buffer.from(data.salt, 'hex') : crypto.randomBytes(config.saltBytes);
      const encoding = data.encoding || config.digestEncoding;

      let hash;
      if (data.password) {
        // PBKDF2 pour les mots de passe
        const iterations = data.iterations || config.iterations;
        const keylen = data.keylen || config.keyBytes;

        hash = crypto
          .pbkdf2Sync(data.payload, salt, iterations, keylen, algorithm)
          .toString(encoding);
      } else {
        // Hachage simple pour les autres données
        const hmac = crypto.createHmac(algorithm, salt);
        hmac.update(data.payload);
        hash = hmac.digest(encoding);
      }

      eventBus.publish(EVENT_TYPES.HASH_DATA_RESULT, {
        requestId: data.requestId,
        success: true,
        hash,
        salt: salt.toString('hex'),
        algorithm
      });
    } catch (error) {
      publishError('HASHING_FAILED', error);

      eventBus.publish(EVENT_TYPES.HASH_DATA_RESULT, {
        requestId: data.requestId,
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Gère une demande de vérification de hachage
   * @param {Object} data - Données pour la vérification
   */
  function handleVerifyHash(data) {
    if (!data || !data.requestId) {
      publishError('INVALID_REQUEST', new Error('Requête invalide: ID requis'));
      return;
    }

    try {
      if (!data.payload || !data.hash || !data.salt) {
        throw new Error('Informations incomplètes pour la vérification');
      }

      const algorithm = data.algorithm || config.hashAlgorithm;
      const salt = Buffer.from(data.salt, 'hex');
      const encoding = data.encoding || config.digestEncoding;

      let computedHash;
      if (data.password) {
        // PBKDF2 pour les mots de passe
        const iterations = data.iterations || config.iterations;
        const keylen = data.keylen || config.keyBytes;

        computedHash = crypto
          .pbkdf2Sync(data.payload, salt, iterations, keylen, algorithm)
          .toString(encoding);
      } else {
        // Hachage simple
        const hmac = crypto.createHmac(algorithm, salt);
        hmac.update(data.payload);
        computedHash = hmac.digest(encoding);
      }

      const isValid = crypto.timingSafeEqual(
        Buffer.from(computedHash, encoding),
        Buffer.from(data.hash, encoding)
      );

      eventBus.publish(EVENT_TYPES.VERIFY_HASH_RESULT, {
        requestId: data.requestId,
        success: true,
        isValid
      });
    } catch (error) {
      publishError('HASH_VERIFICATION_FAILED', error);

      eventBus.publish(EVENT_TYPES.VERIFY_HASH_RESULT, {
        requestId: data.requestId,
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Gère une demande de génération de token
   * @param {Object} data - Paramètres pour la génération de token
   */
  function handleGenerateToken(data) {
    if (!data || !data.requestId) {
      publishError('INVALID_REQUEST', new Error('Requête invalide: ID requis'));
      return;
    }

    try {
      const length = data.length || 32; // Longueur par défaut de 32 caractères
      const token = generateSecureToken(length);

      eventBus.publish(EVENT_TYPES.GENERATE_TOKEN_RESULT, {
        requestId: data.requestId,
        success: true,
        token
      });
    } catch (error) {
      publishError('TOKEN_GENERATION_FAILED', error);

      eventBus.publish(EVENT_TYPES.GENERATE_TOKEN_RESULT, {
        requestId: data.requestId,
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Chiffre des données
   * @param {string|Object} data - Données à chiffrer
   * @param {string|Buffer} [additionalData] - Données authentifiées supplémentaires (AAD) pour GCM
   * @returns {Object} - Résultat du chiffrement {iv, tag, encrypted}
   */
  function encryptData(data, additionalData) {
    try {
      // Convertir les objets en JSON, laisser les chaînes telles quelles
      const serializedData = typeof data === 'object' ? JSON.stringify(data) : data;

      // Générer un IV aléatoire
      const iv = crypto.randomBytes(config.ivBytes);

      // Créer le chiffreur
      const cipher = crypto.createCipheriv(config.algorithm, masterKey, iv);

      // Si des données additionnelles sont fournies, les ajouter
      if (additionalData) {
        cipher.setAAD(
          Buffer.isBuffer(additionalData) ? additionalData : Buffer.from(additionalData)
        );
      }

      // Chiffrer les données
      let encrypted = cipher.update(serializedData, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Obtenir le tag d'authentification (pour GCM)
      const tag = cipher.getAuthTag();

      return {
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        encrypted,
        algorithm: config.algorithm
      };
    } catch (error) {
      throw new Error(`Échec du chiffrement: ${error.message}`);
    }
  }

  /**
   * Déchiffre des données
   * @param {Object} encryptedData - Données chiffrées {iv, tag, encrypted}
   * @param {string|Buffer} [additionalData] - Données authentifiées supplémentaires (AAD) pour GCM
   * @returns {string|Object} - Données déchiffrées
   */
  function decryptData(encryptedData, additionalData) {
    try {
      if (!encryptedData.iv || !encryptedData.tag || !encryptedData.encrypted) {
        throw new Error('Format de données chiffrées invalide');
      }

      // Convertir les données en Buffers
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');

      // Créer le déchiffreur
      const decipher = crypto.createDecipheriv(
        encryptedData.algorithm || config.algorithm,
        masterKey,
        iv
      );

      // Définir le tag d'authentification
      decipher.setAuthTag(tag);

      // Si des données additionnelles sont fournies, les ajouter
      if (additionalData) {
        decipher.setAAD(
          Buffer.isBuffer(additionalData) ? additionalData : Buffer.from(additionalData)
        );
      }

      // Déchiffrer les données
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Si les données déchiffrées sont un JSON, le parser
      try {
        return JSON.parse(decrypted);
      } catch (e) {
        // Ce n'est pas du JSON, retourner la chaîne brute
        return decrypted;
      }
    } catch (error) {
      throw new Error(`Échec du déchiffrement: ${error.message}`);
    }
  }

  /**
   * Génère un token sécurisé
   * @param {number} length - Longueur du token en octets
   * @returns {string} - Token généré en hexadécimal
   */
  function generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Publie une erreur sur le bus d'événements
   * @param {string} code - Code d'erreur
   * @param {Error} error - Objet d'erreur
   */
  function publishError(code, error) {
    eventBus.publish(EVENT_TYPES.ERROR.NON_CRITICAL, {
      source: 'crypto-utils',
      code,
      message: error.message,
      stack: error.stack
    });

    eventBus.publish(EVENT_TYPES.LOG.ERROR, {
      source: 'crypto-utils',
      message: `Erreur: ${code} - ${error.message}`
    });
  }

  // API publique
  return {
    initialize
  };
}

// Créer et exporter l'instance
const cryptoUtils = CryptoUtils();

module.exports = cryptoUtils;

/**
 * Exemples d'utilisation:
 *
 * // Initialisation
 * const eventBus = window.appEvents; // Obtenu globalement
 * const EVENT_TYPES = require('./constants/event-types');
 *
 * // Initialiser via le bus d'événements
 * eventBus.publish('APP_INIT', {
 *   module: 'crypto-utils',
 *   eventBus,
 *   eventTypes: EVENT_TYPES
 * });
 *
 * // Chiffrer des données
 * eventBus.publish('ENCRYPT_DATA', {
 *   requestId: 'encrypt-123',
 *   payload: { username: 'user', token: 'sensitive-data' },
 *   additionalData: 'session-context'
 * });
 *
 * // Écouter le résultat
 * eventBus.subscribe('ENCRYPT_DATA_RESULT', (result) => {
 *   if (result.requestId === 'encrypt-123' && result.success) {
 *     console.log('Données chiffrées:', result.encrypted);
 *
 *     // Puis déchiffrer
 *     eventBus.publish('DECRYPT_DATA', {
 *       requestId: 'decrypt-456',
 *       encrypted: result.encrypted,
 *       additionalData: 'session-context'
 *     });
 *   }
 * });
 *
 * // Écouter le résultat du déchiffrement
 * eventBus.subscribe('DECRYPT_DATA_RESULT', (result) => {
 *   if (result.requestId === 'decrypt-456' && result.success) {
 *     console.log('Données déchiffrées:', result.decrypted);
 *   }
 * });
 *
 * // Hacher un mot de passe
 * eventBus.publish('HASH_DATA', {
 *   requestId: 'hash-789',
 *   payload: 'password123',
 *   password: true
 * });
 *
 * // Écouter le résultat du hachage
 * eventBus.subscribe('HASH_DATA_RESULT', (result) => {
 *   if (result.requestId === 'hash-789' && result.success) {
 *     console.log('Hash:', result.hash);
 *     console.log('Salt:', result.salt);
 *
 *     // Vérifier le hash
 *     eventBus.publish('VERIFY_HASH', {
 *       requestId: 'verify-101',
 *       payload: 'password123',
 *       hash: result.hash,
 *       salt: result.salt,
 *       password: true
 *     });
 *   }
 * });
 */ // Utilitaires de cryptographie
// Créé automatiquement le 2025-05-02
