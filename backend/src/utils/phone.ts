export type NormalizedPhoneNumber = {
  countryCode: string;
  nationalNumber: string;
  normalizedNumber: string;
};

const stripPhoneSeparators = (value: string) => value.trim().replace(/[+\s\-()]/g, '');

export const normalizePhoneNumber = (countryDialCode: string, nationalNumber: string): NormalizedPhoneNumber => {
  const countryCode = stripPhoneSeparators(countryDialCode);
  const digitsOnlyNationalNumber = stripPhoneSeparators(nationalNumber);

  if (!/^[0-9]{1,4}$/.test(countryCode)) {
    throw new Error('Country code must contain digits only.');
  }
  if (!/^[0-9]{6,14}$/.test(digitsOnlyNationalNumber)) {
    throw new Error('National phone number must contain digits only.');
  }

  const normalizedNumber = `${countryCode}${digitsOnlyNationalNumber}`;
  if (!/^[0-9]{10,15}$/.test(normalizedNumber)) {
    throw new Error('Phone number must contain 10 to 15 digits after normalization.');
  }

  return {
    countryCode,
    nationalNumber: digitsOnlyNationalNumber,
    normalizedNumber
  };
};

export const normalizeCanonicalPhoneNumber = (phoneNumber: string) => {
  const normalizedNumber = stripPhoneSeparators(phoneNumber);
  if (!/^[0-9]{10,15}$/.test(normalizedNumber)) {
    throw new Error('Phone number must contain 10 to 15 digits after normalization.');
  }
  return normalizedNumber;
};
