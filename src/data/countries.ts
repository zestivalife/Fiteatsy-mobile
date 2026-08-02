export type CountryOption = {
  iso2: string;
  flag: string;
  name: string;
  dialCode: string;
};

export const COUNTRIES: CountryOption[] = [
  { iso2: 'IN', flag: '🇮🇳', name: 'India', dialCode: '+91' },
  { iso2: 'US', flag: '🇺🇸', name: 'United States', dialCode: '+1' },
  { iso2: 'GB', flag: '🇬🇧', name: 'United Kingdom', dialCode: '+44' },
  { iso2: 'AE', flag: '🇦🇪', name: 'United Arab Emirates', dialCode: '+971' },
  { iso2: 'SG', flag: '🇸🇬', name: 'Singapore', dialCode: '+65' },
  { iso2: 'CA', flag: '🇨🇦', name: 'Canada', dialCode: '+1' },
  { iso2: 'AU', flag: '🇦🇺', name: 'Australia', dialCode: '+61' },
  { iso2: 'NZ', flag: '🇳🇿', name: 'New Zealand', dialCode: '+64' },
  { iso2: 'DE', flag: '🇩🇪', name: 'Germany', dialCode: '+49' },
  { iso2: 'FR', flag: '🇫🇷', name: 'France', dialCode: '+33' },
  { iso2: 'NL', flag: '🇳🇱', name: 'Netherlands', dialCode: '+31' },
  { iso2: 'ZA', flag: '🇿🇦', name: 'South Africa', dialCode: '+27' }
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

export const findCountryByIso2 = (iso2: string | null | undefined) =>
  COUNTRIES.find((country) => country.iso2 === iso2) ?? DEFAULT_COUNTRY;
