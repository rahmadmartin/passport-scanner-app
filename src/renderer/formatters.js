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

module.exports = {
  formatDateForInput,
  formatFieldName,
  toTitleCase,
  simulateDelay,
  truncateBase64,
};
