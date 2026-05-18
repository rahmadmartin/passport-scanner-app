const countries = require('i18n-iso-countries');
const configManager = require('../config-manager');

const API_CONFIG = configManager.loadConfig();

function formatDateForInput(value) {
  if (!value) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return '';
}

function formatFieldName(field) {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function toTitleCase(str) {
  if (!str) return str;

  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function simulateDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateBase64(base64String) {
  const maxLength = 100;
  return base64String.length > maxLength
    ? base64String.slice(0, maxLength) + '...' + base64String.slice(-15)
    : base64String;
}

function normalizeNationalityCode(code) {
  if (!code || typeof code !== 'string') return '';

  const useIso2 = API_CONFIG?.UseIso2Nationality !== false;

  if (useIso2) {
    return code.length === 3 ? countries.alpha3ToAlpha2(code) || code : code;
  }

  return code.length === 2 ? countries.alpha2ToAlpha3(code) || code : code;
}

function normalizeCountryCode(code) {
  if (!code || typeof code !== 'string') return '';

  const useIso2 = API_CONFIG?.UseIso2Country !== false;

  if (useIso2) {
    return code.length === 3 ? countries.alpha3ToAlpha2(code) || code : code;
  }

  return code.length === 2 ? countries.alpha2ToAlpha3(code) || code : code;
}

function isValidCountryCode(code, useIso2) {
  if (!code || typeof code !== 'string')
    return { valid: false, normalized: '' };

  const trimmed = code.trim().toUpperCase();
  let valid = false;

  if (useIso2) {
    valid = trimmed.length === 2 && countries.isValid(trimmed);
  } else {
    valid = trimmed.length === 3 && countries.isValid(trimmed);
  }

  return { valid, normalized: valid ? trimmed : '' };
}

function isValidDate(value) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);

  if (month < 1 || month > 12) return false;

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;

  return true;
}

function sanitize(name) {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

module.exports = {
  formatDateForInput,
  formatFieldName,
  toTitleCase,
  simulateDelay,
  truncateBase64,
  normalizeNationalityCode,
  normalizeCountryCode,
  isValidCountryCode,
  isValidDate,
  sanitize,
};
