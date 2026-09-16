import { calculateAgeFromDateOfBirth, calculateBmi, calculateBodyFatPercentage, calculateLeanBodyMassKg, calculateWaistHipRatio } from '../src/utils/canonicalBodyMetrics';

describe('canonical profile body metrics', () => {
  test('age is derived from DOB and respects the birthday boundary', () => {
    expect(calculateAgeFromDateOfBirth('2000-09-17', new Date('2026-09-16T12:00:00Z'))).toBe(25);
    expect(calculateAgeFromDateOfBirth('2000-09-16', new Date('2026-09-16T12:00:00Z'))).toBe(26);
    expect(calculateAgeFromDateOfBirth(null)).toBeNull();
  });

  test('BMI uses canonical kilograms and metres', () => {
    expect(calculateBmi(162, 58)).toBe(22.1);
    expect(calculateBmi(null, 58)).toBeNull();
  });

  test('waist-hip ratio remains unavailable without both measurements', () => {
    expect(calculateWaistHipRatio(72, 96)).toBe(0.75);
    expect(calculateWaistHipRatio(72, null)).toBeNull();
    expect(calculateWaistHipRatio(72, 0)).toBeNull();
  });

  test('lean body mass is deterministic and never fabricated without body fat', () => {
    expect(calculateLeanBodyMassKg(75, 18.16)).toBe(61.38);
    expect(calculateLeanBodyMassKg(75, null)).toBeNull();
  });

  test('Navy body-fat estimate normalizes centimetres to inches', () => {
    expect(calculateBodyFatPercentage({ gender:'Male', heightCm:180, waistCm:90, neckCm:40 })).toBe(18.5);
    expect(calculateBodyFatPercentage({ gender:'Female', heightCm:165, waistCm:75, hipCm:100, neckCm:35 })).toBe(28.7);
    expect(calculateBodyFatPercentage({ gender:'Female', heightCm:165, waistCm:75, neckCm:35 })).toBeNull();
  });
});
