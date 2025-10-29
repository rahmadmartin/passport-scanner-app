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

function isValidCountryCode(code, useIso2) {
  if (!code || typeof code !== 'string')
    return { valid: false, normalized: '' };

  const trimmed = code.trim().toUpperCase();
  let valid = false;

  if (useIso2) {
    // Only accept ISO2 format (2-letter)
    valid = trimmed.length === 2 && countries.isValid(trimmed);
  } else {
    // Only accept ISO3 format (3-letter)
    valid = trimmed.length === 3 && countries.isValid(trimmed);
  }

  return { valid, normalized: valid ? trimmed : '' };
}

function isValidDate(value) {
  // Check format YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;

  // Parse components
  const [year, month, day] = value.split('-').map(Number);

  // Check valid month
  if (month < 1 || month > 12) return false;

  // Check valid day for that month
  const daysInMonth = new Date(year, month, 0).getDate(); // last day of the month
  if (day < 1 || day > daysInMonth) return false;

  return true;
}

module.exports = {
  normalizeNationalityCode,
  normalizeCountryCode,
  toTitleCase,
  isValidCountryCode,
  isValidDate,
};
