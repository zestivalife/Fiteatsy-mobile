const stripPhoneSeparators = (value) => value.trim().replace(/[+\s\-()]/g, '');
export const normalizePhoneNumber = (countryDialCode, nationalNumber) => {
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
export const normalizeCanonicalPhoneNumber = (phoneNumber) => {
    const digits = stripPhoneSeparators(phoneNumber);
    const normalizedNumber = digits.length === 10 ? `91${digits}` : digits;
    if (!/^[0-9]{10,15}$/.test(normalizedNumber)) {
        throw new Error('Phone number must contain 10 to 15 digits after normalization.');
    }
    return normalizedNumber;
};
