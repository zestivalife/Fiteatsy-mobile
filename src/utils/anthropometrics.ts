export type AnthropometricValues = {
  heightCm: number;
  weightKg: number;
  armCircumferenceCm: number;
  thighCircumferenceCm: number;
  calfCircumferenceCm: number;
};

const inRange = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;

export const validateAnthropometrics = (values: AnthropometricValues) => ({
  heightCm: inRange(values.heightCm, 100, 250) ? null : 'Height must be between 100 and 250 cm.',
  weightKg: inRange(values.weightKg, 20, 300) ? null : 'Weight must be between 20 and 300 kg.',
  armCircumferenceCm: inRange(values.armCircumferenceCm, 10, 100) ? null : 'Arm circumference must be between 10 and 100 cm.',
  thighCircumferenceCm: inRange(values.thighCircumferenceCm, 20, 150) ? null : 'Thigh circumference must be between 20 and 150 cm.',
  calfCircumferenceCm: inRange(values.calfCircumferenceCm, 10, 100) ? null : 'Calf circumference must be between 10 and 100 cm.'
});

export const calculateBmi = (weightKg: number, heightCm: number) => {
  const metres = heightCm / 100;
  if (!inRange(weightKg, 20, 300) || !inRange(heightCm, 100, 250)) return null;
  return Number((weightKg / (metres * metres)).toFixed(1));
};
