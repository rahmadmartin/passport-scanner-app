function mapMrzToGuest(mrzData, docFile = null) {
  return {
    firstName: mrzData.given_name || '',
    lastName: mrzData.surname || '',
    nationality: mrzData.nationality_code || '',
    birthDate: mrzData.birth_date || '',
    gender: mrzData.sex || '',
    documents: [
      {
        docType: getDocumentType(mrzData.document_code),
        docNumber: mrzData.document_number || '',
        expiryDate: mrzData.expiry_date || '',
        issueCountry: mrzData.issuer_code || '',
        givenname: mrzData.given_name || '',
        surname: mrzData.surname || '',
        birthDate: mrzData.birth_date || '',
        nationality: mrzData.nationality_code || '',
        docFile,
      },
    ],
  };
}

function getDocumentType(docCode) {
  const docTypeMap = {
    P: 'PASSPORT',
    I: 'ID_CARD',
    A: 'IDENTITY_CARD',
    C: 'IDENTITY_CARD',
    V: 'VISA',
  };
  return docTypeMap[docCode] || 'PASSPORT';
}

function convertGender(gender) {
  const genderMap = { M: 'Male', F: 'Female' };
  return genderMap[gender] || null;
}

function convertDocType(docType) {
  const docTypeMap = {
    PASSPORT: 'PASSPORT',
    ID_CARD: 'NATIONAL_ID',
    IDENTITY_CARD: 'NATIONAL_ID',
  };
  return docTypeMap[docType] || 'PASSPORT';
}

function getDefaultLanguage() {
  return 'E';
}

function shouldUploadDocuments() {
  return true;
}

module.exports = {
  mapMrzToGuest,
  getDocumentType,
  convertGender,
  convertDocType,
  getDefaultLanguage,
  shouldUploadDocuments,
};
