const countries = require('i18n-iso-countries');
const configManager = require('../config-manager');

const API_CONFIG = configManager.loadConfig(); // load once, stays in memory

function normalizeNationalityCode(code) {
  if (!code || typeof code !== 'string') return '';

  const useIso2 = API_CONFIG?.UseIso2Nationality === true;
  const useIso3 = API_CONFIG?.UseIso3Nationality === true;

  // Default: ISO2 if both flags are false/undefined
  if (useIso2 || (!useIso2 && !useIso3)) {
    return code.length === 3 ? countries.alpha3ToAlpha2(code) || code : code;
  }

  if (useIso3) {
    return code.length === 2 ? countries.alpha2ToAlpha3(code) || code : code;
  }

  return code;
}

module.exports = { normalizeNationalityCode };
