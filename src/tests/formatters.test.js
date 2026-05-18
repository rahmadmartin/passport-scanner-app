const assert = require('assert');
const path = require('path');

const formattersPath = path.resolve(__dirname, '../renderer/formatters.js');
const configManagerPath = path.resolve(__dirname, '../config-manager.js');

function loadFormattersWithConfig(config) {
  delete require.cache[formattersPath];
  delete require.cache[configManagerPath];

  require.cache[configManagerPath] = {
    id: configManagerPath,
    filename: configManagerPath,
    loaded: true,
    exports: {
      loadConfig: () => config,
    },
  };

  return require(formattersPath);
}

function assertEqual(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  console.log('PASS', label);
}

function assertDeepEqual(actual, expected, label) {
  assert.deepStrictEqual(actual, expected, label);
  console.log('PASS', label);
}

async function runTests() {
  const originalFormattersCache = require.cache[formattersPath];
  const originalConfigManagerCache = require.cache[configManagerPath];

  try {
    const iso2Formatters = loadFormattersWithConfig({
      UseIso2Country: true,
      UseIso2Nationality: true,
    });

    assertEqual(
      iso2Formatters.formatDateForInput('2026-05-18'),
      '2026-05-18',
      'formatDateForInput keeps YYYY-MM-DD values',
    );
    assertEqual(
      iso2Formatters.formatDateForInput('2026-05-18T12:00:00Z'),
      '2026-05-18',
      'formatDateForInput converts parseable date strings',
    );
    assertEqual(
      iso2Formatters.formatDateForInput('not-a-date'),
      '',
      'formatDateForInput returns empty string for invalid dates',
    );
    assertEqual(
      iso2Formatters.formatDateForInput(''),
      '',
      'formatDateForInput returns empty string for empty values',
    );

    assertEqual(
      iso2Formatters.formatFieldName('guestFirstName'),
      'Guest First Name',
      'formatFieldName splits camelCase',
    );
    assertEqual(
      iso2Formatters.formatFieldName('guest_first_name'),
      'Guest first name',
      'formatFieldName replaces underscores',
    );

    assertEqual(
      iso2Formatters.toTitleCase('mARTIN luTHER'),
      'Martin Luther',
      'toTitleCase normalizes mixed-case words',
    );
    assertEqual(
      iso2Formatters.toTitleCase(''),
      '',
      'toTitleCase returns empty values unchanged',
    );

    const shortBase64 = 'abc123';
    assertEqual(
      iso2Formatters.truncateBase64(shortBase64),
      shortBase64,
      'truncateBase64 keeps short strings unchanged',
    );

    const longBase64 = 'a'.repeat(120);
    assertEqual(
      iso2Formatters.truncateBase64(longBase64),
      `${'a'.repeat(100)}...${'a'.repeat(15)}`,
      'truncateBase64 shortens long strings',
    );

    assertEqual(
      iso2Formatters.normalizeCountryCode('IDN'),
      'ID',
      'normalizeCountryCode converts ISO3 to ISO2 when configured for ISO2',
    );
    assertEqual(
      iso2Formatters.normalizeNationalityCode('USA'),
      'US',
      'normalizeNationalityCode converts ISO3 to ISO2 when configured for ISO2',
    );
    assertEqual(
      iso2Formatters.normalizeCountryCode('ID'),
      'ID',
      'normalizeCountryCode keeps ISO2 codes when configured for ISO2',
    );
    assertEqual(
      iso2Formatters.normalizeCountryCode(null),
      '',
      'normalizeCountryCode returns empty string for invalid input',
    );
    assertEqual(
      iso2Formatters.normalizeNationalityCode(123),
      '',
      'normalizeNationalityCode returns empty string for non-string input',
    );

    assertDeepEqual(
      iso2Formatters.isValidCountryCode(' id ', true),
      { valid: true, normalized: 'ID' },
      'isValidCountryCode validates ISO2 country codes',
    );
    assertDeepEqual(
      iso2Formatters.isValidCountryCode('IDN', true),
      { valid: false, normalized: '' },
      'isValidCountryCode rejects ISO3 when ISO2 is required',
    );
    assertDeepEqual(
      iso2Formatters.isValidCountryCode('', true),
      { valid: false, normalized: '' },
      'isValidCountryCode rejects empty input',
    );

    assertEqual(
      iso2Formatters.isValidDate('2024-02-29'),
      true,
      'isValidDate accepts valid leap-day dates',
    );
    assertEqual(
      iso2Formatters.isValidDate('2023-02-29'),
      false,
      'isValidDate rejects invalid day-of-month values',
    );
    assertEqual(
      iso2Formatters.isValidDate('2026-13-01'),
      false,
      'isValidDate rejects invalid months',
    );
    assertEqual(
      iso2Formatters.isValidDate('18-05-2026'),
      false,
      'isValidDate rejects non-YYYY-MM-DD formats',
    );

    assertEqual(
      iso2Formatters.sanitize('Ir. Danny_Budiharto, MBA'),
      'Ir_Danny_Budiharto_MBA',
      'sanitize replaces punctuation and spaces with underscores',
    );
    assertEqual(
      iso2Formatters.sanitize('...John...'),
      'John',
      'sanitize trims leading and trailing underscores',
    );

    const delayStart = Date.now();
    await iso2Formatters.simulateDelay(5);
    assert.ok(Date.now() - delayStart >= 1, 'simulateDelay resolves asynchronously');
    console.log('PASS simulateDelay resolves asynchronously');

    const iso3Formatters = loadFormattersWithConfig({
      UseIso2Country: false,
      UseIso2Nationality: false,
    });

    assertEqual(
      iso3Formatters.normalizeCountryCode('ID'),
      'IDN',
      'normalizeCountryCode converts ISO2 to ISO3 when configured for ISO3',
    );
    assertEqual(
      iso3Formatters.normalizeNationalityCode('US'),
      'USA',
      'normalizeNationalityCode converts ISO2 to ISO3 when configured for ISO3',
    );
    assertDeepEqual(
      iso3Formatters.isValidCountryCode(' idn ', false),
      { valid: true, normalized: 'IDN' },
      'isValidCountryCode validates ISO3 country codes',
    );
    assertDeepEqual(
      iso3Formatters.isValidCountryCode('ID', false),
      { valid: false, normalized: '' },
      'isValidCountryCode rejects ISO2 when ISO3 is required',
    );
  } finally {
    if (originalFormattersCache) {
      require.cache[formattersPath] = originalFormattersCache;
    } else {
      delete require.cache[formattersPath];
    }

    if (originalConfigManagerCache) {
      require.cache[configManagerPath] = originalConfigManagerCache;
    } else {
      delete require.cache[configManagerPath];
    }
  }
}

if (require.main === module) {
  runTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runTests };
