const countries = require('i18n-iso-countries');
const configManager = require('../config-manager');

const API_CONFIG = configManager.loadConfig(); // load once, stays in memory

function normalizeNationalityCode(code) {
  if (!code || typeof code !== 'string') return '';

  const useIso2 = API_CONFIG?.UseIso2Nationality !== false;

  if (useIso2) {
    return code.length === 3 ? countries.alpha3ToAlpha2(code) || code : code;
  } else {
    return code.length === 2 ? countries.alpha2ToAlpha3(code) || code : code;
  }
}

function normalizeCountryCode(code) {
  if (!code || typeof code !== 'string') return '';

  const useIso2 = API_CONFIG?.UseIso2Country !== false;

  if (useIso2) {
    return code.length === 3 ? countries.alpha3ToAlpha2(code) || code : code;
  } else {
    return code.length === 2 ? countries.alpha2ToAlpha3(code) || code : code;
  }
}

function toTitleCase(str) {
  if (!str) return str;

  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

module.exports = {
  normalizeNationalityCode,
  normalizeCountryCode,
  toTitleCase,
};
