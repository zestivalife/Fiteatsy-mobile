import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { MealRelation, Medication, MedicationType, ReminderSound } from '../../types';
import { useAppContext } from '../../state/AppContext';

const medicationTypes: Array<{ type: MedicationType; label: string; icon: string }> = [
  { type: 'tablet', label: 'Tablet', icon: '💊' },
  { type: 'capsule', label: 'Capsule', icon: '🧴' },
  { type: 'syrup', label: 'Syrup', icon: '🥄' },
  { type: 'injection', label: 'Injection', icon: '💉' },
  { type: 'drops', label: 'Drops', icon: '🩸' },
  { type: 'powder', label: 'Powder', icon: '🧪' }
];

const frequencyOptions = [
  { key: 'every_day', label: 'Every Day' },
  { key: 'alternate_days', label: 'Alternate Days' },
  { key: 'specific_weekdays', label: 'Specific Weekdays' },
  { key: 'every_x_days', label: 'Every X Days' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'custom', label: 'Custom' }
] as const;

const mealOptions: Array<{ key: MealRelation; label: string }> = [
  { key: 'before_meal', label: 'Before Meal' },
  { key: 'after_meal', label: 'After Meal' },
  { key: 'with_meal', label: 'With Meal' },
  { key: 'empty_stomach', label: 'Empty Stomach' }
];

const soundOptions: Array<{ key: ReminderSound; label: string }> = [
  { key: 'default', label: 'Default ringtone' },
  { key: 'soft', label: 'Soft tone' },
  { key: 'bell', label: 'Bell tone' },
  { key: 'medical_alert', label: 'Medical alert tone' }
];

type Props = NativeStackScreenProps<RootStackParamList, 'MedicationForm'>;

const toInputDate = (iso: string) => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const MedicationFormScreen = ({ route, navigation }: Props) => {
  const { medications, addMedication, updateMedication } = useAppContext();
  const editing = medications.find((m) => m.id === route.params?.medicationId) ?? null;

  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<MedicationType>(editing?.type ?? 'tablet');
  const [dosage, setDosage] = useState(editing?.dosage ?? '1 Tablet');
  const [frequencyPreset, setFrequencyPreset] = useState<Medication['schedule']['frequency']['preset']>(editing?.schedule.frequency.preset ?? 'every_day');
  const [intervalDays, setIntervalDays] = useState(String(editing?.schedule.frequency.intervalDays ?? 2));
  const [weekdays, setWeekdays] = useState<number[]>(editing?.schedule.frequency.weekdays ?? [1, 3, 5]);
  const [times, setTimes] = useState<Array<{ id: string; time24h: string; mealRelation: MealRelation }>>(
    editing?.schedule.timeSlots ?? [{ id: `slot-${Date.now()}`, time24h: '08:00', mealRelation: 'after_meal' }]
  );
  const [startDate, setStartDate] = useState(toInputDate(editing?.schedule.duration.startDateISO ?? new Date().toISOString()));
  const [endDate, setEndDate] = useState(editing?.schedule.duration.endDateISO ? toInputDate(editing.schedule.duration.endDateISO) : '');
  const [ongoing, setOngoing] = useState(editing?.schedule.duration.ongoing ?? true);
  const [reminderSound, setReminderSound] = useState<ReminderSound>(editing?.reminderSound ?? 'default');

  const canSave = name.trim().length > 1 && dosage.trim().length > 0 && times.length > 0;

  const frequencyPayload = useMemo(() => {
    if (frequencyPreset === 'every_x_days') {
      return { preset: frequencyPreset, intervalDays: Math.max(1, Number(intervalDays) || 1) };
    }
    if (frequencyPreset === 'specific_weekdays' || frequencyPreset === 'weekly') {
      return { preset: frequencyPreset, weekdays };
    }
    if (frequencyPreset === 'monthly') {
      return { preset: frequencyPreset, monthlyDays: [new Date(startDate).getDate()] };
    }
    if (frequencyPreset === 'custom') {
      return { preset: frequencyPreset, customRule: 'FREQ=DAILY' };
    }
    return { preset: frequencyPreset };
  }, [frequencyPreset, intervalDays, weekdays, startDate]);

  const toggleWeekday = (index: number) => {
    setWeekdays((previous) =>
      previous.includes(index) ? previous.filter((item) => item !== index) : [...previous, index].sort((a, b) => a - b)
    );
  };

  const addTimeSlot = () => {
    setTimes((previous) => [...previous, { id: `slot-${Date.now()}-${previous.length}`, time24h: '20:00', mealRelation: 'after_meal' }]);
  };

  const updateTimeSlot = (slotId: string, patch: Partial<{ time24h: string; mealRelation: MealRelation }>) => {
    setTimes((previous) => previous.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
  };

  const removeTimeSlot = (slotId: string) => {
    setTimes((previous) => (previous.length === 1 ? previous : previous.filter((slot) => slot.id !== slotId)));
  };

  const onSave = async () => {
    const payload = {
      name: name.trim(),
      type,
      dosage: dosage.trim(),
      schedule: {
        frequency: frequencyPayload,
        timeSlots: times,
        duration: {
          startDateISO: new Date(startDate).toISOString(),
          endDateISO: ongoing || !endDate ? null : new Date(endDate).toISOString(),
          ongoing
        }
      },
      reminderSound,
      status: 'active' as const
    };

    if (editing) {
      await updateMedication(editing.id, payload);
    } else {
      await addMedication(payload);
    }

    navigation.goBack();
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>{editing ? 'Edit Medication' : 'Add Medication'}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Medication Name</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="e.g. Metformin" placeholderTextColor={colors.textMuted} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Medication Type</Text>
          <View style={styles.rowWrap}>
            {medicationTypes.map((option) => (
              <Pressable key={option.type} style={[styles.typeChip, type === option.type && styles.typeChipActive]} onPress={() => setType(option.type)}>
                <Text style={styles.typeIcon}>{option.icon}</Text>
                <Text style={styles.typeLabel}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Dosage</Text>
          <TextInput value={dosage} onChangeText={setDosage} style={styles.input} placeholder="e.g. 1 Tablet" placeholderTextColor={colors.textMuted} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Frequency</Text>
          <View style={styles.rowWrap}>
            {frequencyOptions.map((option) => (
              <Pressable key={option.key} style={[styles.presetChip, frequencyPreset === option.key && styles.presetChipActive]} onPress={() => setFrequencyPreset(option.key)}>
                <Text style={styles.presetText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>

          {frequencyPreset === 'every_x_days' ? (
            <TextInput value={intervalDays} onChangeText={setIntervalDays} style={styles.inputInline} keyboardType="number-pad" placeholder="Every X days" placeholderTextColor={colors.textMuted} />
          ) : null}

          {(frequencyPreset === 'specific_weekdays' || frequencyPreset === 'weekly') && (
            <View style={styles.weekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, idx) => (
                <Pressable key={`${label}-${idx}`} style={[styles.weekChip, weekdays.includes(idx) && styles.weekChipActive]} onPress={() => toggleWeekday(idx)}>
                  <Text style={styles.weekText}>{label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.field}>
          <View style={styles.inlineHeader}>
            <Text style={styles.label}>Reminder Times</Text>
            <Pressable onPress={addTimeSlot}><Text style={styles.link}>+ Add Time</Text></Pressable>
          </View>

          <View style={styles.stack}>
            {times.map((slot) => (
              <View key={slot.id} style={styles.timeRow}>
                <TextInput value={slot.time24h} onChangeText={(value) => updateTimeSlot(slot.id, { time24h: value })} style={styles.timeInput} placeholder="08:00" placeholderTextColor={colors.textMuted} />
                <View style={styles.mealWrap}>
                  {mealOptions.map((meal) => (
                    <Pressable key={meal.key} style={[styles.mealChip, slot.mealRelation === meal.key && styles.mealChipActive]} onPress={() => updateTimeSlot(slot.id, { mealRelation: meal.key })}>
                      <Text style={styles.mealText}>{meal.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={() => removeTimeSlot(slot.id)}><Text style={styles.delete}>Remove</Text></Pressable>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Duration</Text>
          <TextInput value={startDate} onChangeText={setStartDate} style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Ongoing Medication</Text>
            <Switch value={ongoing} onValueChange={setOngoing} />
          </View>
          {!ongoing ? (
            <TextInput value={endDate} onChangeText={setEndDate} style={styles.input} placeholder="End date YYYY-MM-DD" placeholderTextColor={colors.textMuted} />
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Reminder Sound</Text>
          <View style={styles.stack}>
            {soundOptions.map((option) => (
              <Pressable key={option.key} style={[styles.soundChip, reminderSound === option.key && styles.soundChipActive]} onPress={() => setReminderSound(option.key)}>
                <Text style={styles.soundText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.helper}>Preview uses platform default notification tone.</Text>
        </View>

        <PrimaryButton title={editing ? 'Save Changes' : 'Add Medication'} disabled={!canSave} onPress={onSave} />
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.md
  },
  backBtn: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.stroke,
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  backText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  title: {
    ...typography.section,
    marginBottom: spacing.xs
  },
  field: {
    gap: spacing.xs
  },
  label: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  input: {
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.textPrimary
  },
  inputInline: {
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    marginTop: spacing.xs
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  typeChip: {
    width: '31%',
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  typeChipActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  typeIcon: {
    fontSize: 18
  },
  typeLabel: {
    ...typography.caption,
    color: colors.textPrimary
  },
  presetChip: {
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  presetChipActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  presetText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  weekRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8
  },
  weekChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center'
  },
  weekChipActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  weekText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  inlineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  link: {
    ...typography.caption,
    color: colors.blue
  },
  stack: {
    gap: 8
  },
  timeRow: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: 10,
    gap: 8
  },
  timeInput: {
    borderWidth: 1,
    borderColor: colors.strokeStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.cardMuted,
    color: colors.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  mealWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  mealChip: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  mealChipActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  mealText: {
    ...typography.caption,
    color: colors.textSecondary
  },
  delete: {
    ...typography.caption,
    color: colors.danger
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  switchLabel: {
    ...typography.body
  },
  soundChip: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.card
  },
  soundChipActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  soundText: {
    ...typography.body,
    color: colors.textPrimary
  },
  helper: {
    ...typography.caption,
    color: colors.textMuted
  }
});
