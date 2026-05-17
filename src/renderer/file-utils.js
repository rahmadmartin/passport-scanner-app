function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function getFileExtension(docFile, debugLog = () => {}) {
  let fileBytes;
  if (typeof docFile === 'string') {
    const base64Data = docFile.replace(/^data:image\/\w+;base64,/, '');
    fileBytes = base64ToUint8Array(base64Data);
  } else if (docFile instanceof Uint8Array || docFile instanceof ArrayBuffer) {
    fileBytes = docFile;
  } else {
    debugLog('🚨', 'Unsupported file format:', typeof docFile);
    return 'UNKNOWN';
  }

  if (!fileBytes || fileBytes.length < 8) {
    return 'UNKNOWN';
  }

  if (fileBytes[0] === 0xff && fileBytes[1] === 0xd8 && fileBytes[2] === 0xff) {
    return 'jpg';
  }

  if (
    fileBytes[0] === 0x89 &&
    fileBytes[1] === 0x50 &&
    fileBytes[2] === 0x4e &&
    fileBytes[3] === 0x47 &&
    fileBytes[4] === 0x0d &&
    fileBytes[5] === 0x0a &&
    fileBytes[6] === 0x1a &&
    fileBytes[7] === 0x0a
  ) {
    return 'png';
  }

  if (
    fileBytes[0] === 0x25 &&
    fileBytes[1] === 0x50 &&
    fileBytes[2] === 0x44 &&
    fileBytes[3] === 0x46 &&
    fileBytes[4] === 0x2d
  ) {
    return 'pdf';
  }

  return 'UNKNOWN';
}

function safeBase64Decode(base64String, debugLog = () => {}) {
  try {
    const base64Data = base64String.replace(/^data:image\/[a-z]+;base64,/, '');
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(base64Data)) {
      throw new Error('Invalid base64 format');
    }

    return atob(base64Data);
  } catch (error) {
    debugLog('🚨', 'Base64 decode error:', error);
    throw new Error('Failed to decode base64 document data');
  }
}

function base64ToBlob(base64Data, contentType = 'image/jpeg', debugLog = () => {}) {
  try {
    const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(cleanBase64)) {
      throw new Error('Invalid base64 format');
    }

    const paddedBase64 =
      cleanBase64 + '='.repeat((4 - (cleanBase64.length % 4)) % 4);
    const byteCharacters = atob(paddedBase64);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  } catch (error) {
    debugLog('🚨', 'Base64 to blob conversion error:', error);
    throw new Error('Failed to convert base64 to blob: ' + error.message);
  }
}

module.exports = {
  base64ToUint8Array,
  getFileExtension,
  safeBase64Decode,
  base64ToBlob,
};
