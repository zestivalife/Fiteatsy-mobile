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
    throw new Error('Select a valid country code.');
  }
  if (!/^[0-9]{6,14}$/.test(digitsOnlyNationalNumber)) {
    throw new Error('Enter a valid phone number.');
  }

  const normalizedNumber = `${countryCode}${digitsOnlyNationalNumber}`;
  if (!/^[0-9]{10,15}$/.test(normalizedNumber)) {
    throw new Error('Phone number must be 10 to 15 digits including country code.');
  }

  return {
    countryCode,
    nationalNumber: digitsOnlyNationalNumber,
    normalizedNumber
  };
};

export const getPhoneDigits = (value: string) => stripPhoneSeparators(value).replace(/\D/g, '');
