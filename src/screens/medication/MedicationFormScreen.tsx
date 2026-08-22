import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { radius, spacing } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { MealRelation, Medication, MedicationType, ReminderSound } from '../../types';
import { useAppContext } from '../../state/AppContext';

const font = {
  regular: 'Exo_400Regular',
  medium: 'Exo_500Medium',
  semiBold: 'Exo_600SemiBold',
  bold: 'Exo_700Bold'
};

const medicationTheme = {
  text: '#F4F5F6',
  secondary: '#A7ABB1',
  muted: '#747980',
  card: '#111315',
  surface: '#151719',
  surfaceRaised: '#1B1E21',
  input: '#202328',
  border: '#282C30',
  borderStrong: '#3A4046',
  primary: '#171A1D',
  primaryDark: '#050607',
  primaryText: '#F4F5F6',
  danger: '#FF6B73'
};

const medicationTypes: Array<{ type: MedicationType; label: string; unit: string; icon: string }> = [
  { type: 'tablet', label: 'Tablet', unit: 'tablet', icon: '⌁' },
  { type: 'capsule', label: 'Capsule', unit: 'capsule', icon: '◐' },
  { type: 'syrup', label: 'Syrup', unit: 'ml', icon: '⌒' },
  { type: 'injection', label: 'Injection', unit: 'dose', icon: '↯' },
  { type: 'drops', label: 'Drops', unit: 'drops', icon: '◌' },
  { type: 'powder', label: 'Powder', unit: 'scoop', icon: '△' }
];

const strengthOptions = ['250 mg', '500 mg', '850 mg', '1000 mg', '10 mg', '1000 IU'];
const quantityOptions = [0.5, 1, 1.5, 2, 3];

const frequencyOptions = [
  { key: 'every_day', label: 'Once daily' },
  { key: 'alternate_days', label: 'Alternate days' },
  { key: 'specific_weekdays', label: 'Selected days' },
  { key: 'every_x_days', label: 'Every X days' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'custom', label: 'Custom' }
] as const;

const mealOptions: Array<{ key: MealRelation; label: string }> = [
  { key: 'before_meal', label: 'Before food' },
  { key: 'with_meal', label: 'With food' },
  { key: 'after_meal', label: 'After food' },
  { key: 'empty_stomach', label: 'Any time' }
];

const soundOptions: Array<{ key: ReminderSound; label: string }> = [
  { key: 'default', label: 'Default ringtone' },
  { key: 'soft', label: 'Soft tone' },
  { key: 'bell', label: 'Bell tone' },
  { key: 'medical_alert', label: 'Medical alert tone' }
];

const timeOptions = [
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '12:00',
  '13:00',
  '14:00',
  '18:00',
  '20:00',
  '21:00',
  '22:00'
];

type Props = NativeStackScreenProps<RootStackParamList, 'MedicationForm'>;
type PickerSheet =
  | { type: 'startDate'; cursor: Date; selected: Date }
  | { type: 'endDate'; cursor: Date; selected: Date }
  | { type: 'time'; slotId: string }
  | null;

const toInputDate = (iso: string) => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseInputDate = (value: string) => {
  if (!value) return new Date();
  const [year, month, day] = value.split('-').map((part) => Number(part));
  return new Date(year, (month || 1) - 1, day || 1);
};

const displayDate = (value: string) =>
  parseInputDate(value).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

const formatTime = (time24h: string) => {
  const [hours, minutes] = time24h.split(':').map((part) => Number(part));
  const date = new Date();
  date.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const getCalendarDays = (cursor: Date) => {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() - first.getDay());
  return Array.from({ length: 42 }).map((_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
};

const sameDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const parseExistingDosage = (dosage: string, fallbackType: MedicationType) => {
  const strength = strengthOptions.find((option) => dosage.includes(option)) ?? '500 mg';
  const quantitySource = dosage.includes('·') ? dosage.split('·')[1] : dosage;
  const quantityMatch = quantitySource.match(/(\d+(?:\.\d+)?)/);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
  const typeOption = medicationTypes.find((option) => option.type === fallbackType) ?? medicationTypes[0];
  return { strength, quantity: quantityOptions.includes(quantity) ? quantity : 1, unit: typeOption.unit };
};

export const MedicationFormScreen = ({ route, navigation }: Props) => {
  const { medications, addMedication, updateMedication } = useAppContext();
  const editing = medications.find((m) => m.id === route.params?.medicationId) ?? null;
  const parsedDosage = parseExistingDosage(editing?.dosage ?? '', editing?.type ?? 'tablet');

  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<MedicationType>(editing?.type ?? 'tablet');
  const [strength, setStrength] = useState(parsedDosage.strength);
  const [doseQuantity, setDoseQuantity] = useState(parsedDosage.quantity);
  const [purpose, setPurpose] = useState('');
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
  const [pickerSheet, setPickerSheet] = useState<PickerSheet>(null);

  const currentType = medicationTypes.find((option) => option.type === type) ?? medicationTypes[0];
  const dosage = `${strength} · ${doseQuantity} ${currentType.unit}${doseQuantity === 1 ? '' : 's'}`;
  const canSave = name.trim().length > 1 && strength.trim().length > 0 && times.length > 0;

  const frequencyPayload = useMemo(() => {
    if (frequencyPreset === 'every_x_days') {
      return { preset: frequencyPreset, intervalDays: Math.max(1, Number(intervalDays) || 1) };
    }
    if (frequencyPreset === 'specific_weekdays' || frequencyPreset === 'weekly') {
      return { preset: frequencyPreset, weekdays };
    }
    if (frequencyPreset === 'monthly') {
      return { preset: frequencyPreset, monthlyDays: [parseInputDate(startDate).getDate()] };
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
    const slot = { id: `slot-${Date.now()}-${times.length}`, time24h: '20:00', mealRelation: 'after_meal' as MealRelation };
    setTimes((previous) => [...previous, slot]);
    setPickerSheet({ type: 'time', slotId: slot.id });
  };

  const updateTimeSlot = (slotId: string, patch: Partial<{ time24h: string; mealRelation: MealRelation }>) => {
    setTimes((previous) => previous.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
  };

  const removeTimeSlot = (slotId: string) => {
    setTimes((previous) => (previous.length === 1 ? previous : previous.filter((slot) => slot.id !== slotId)));
  };

  const openDateSheet = (typeName: 'startDate' | 'endDate') => {
    const selected = parseInputDate(typeName === 'startDate' ? startDate : endDate || startDate);
    setPickerSheet({ type: typeName, cursor: selected, selected });
  };

  const onSave = async () => {
    const payload = {
      name: name.trim(),
      type,
      dosage,
      schedule: {
        frequency: frequencyPayload,
        timeSlots: times,
        duration: {
          startDateISO: parseInputDate(startDate).toISOString(),
          endDateISO: ongoing || !endDate ? null : parseInputDate(endDate).toISOString(),
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

  const renderChoice = (label: string, active: boolean, onPress: () => void, style?: object) => (
    <Pressable style={[styles.choiceChip, active && styles.choiceChipActive, style]} onPress={onPress}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
      {active ? <Text style={styles.inlineCheckMark}>✓</Text> : null}
    </Pressable>
  );

  const renderCalendarSheet = (sheet: Extract<PickerSheet, { type: 'startDate' | 'endDate' }>) => {
    const days = getCalendarDays(sheet.cursor);
    return (
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{sheet.type === 'startDate' ? 'Select start date' : 'Select end date'}</Text>
        <View style={styles.calendarHeader}>
          <Pressable onPress={() => setPickerSheet({ ...sheet, cursor: new Date(sheet.cursor.getFullYear(), sheet.cursor.getMonth() - 1, 1) })}>
            <Text style={styles.calendarNav}>‹</Text>
          </Pressable>
          <Text style={styles.calendarTitle}>{sheet.cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Text>
          <Pressable onPress={() => setPickerSheet({ ...sheet, cursor: new Date(sheet.cursor.getFullYear(), sheet.cursor.getMonth() + 1, 1) })}>
            <Text style={styles.calendarNav}>›</Text>
          </Pressable>
        </View>
        <View style={styles.weekHeader}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => (
            <Text key={`${label}-${index}`} style={styles.weekHeaderText}>{label}</Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {days.map((day) => {
            const isSelected = sameDate(day, sheet.selected);
            const inMonth = day.getMonth() === sheet.cursor.getMonth();
            return (
              <Pressable
                key={day.toISOString()}
                style={[styles.calendarDay, isSelected && styles.calendarDayActive]}
                onPress={() => setPickerSheet({ ...sheet, selected: day })}
              >
                <Text style={[styles.calendarDayText, !inMonth && styles.calendarDayMuted, isSelected && styles.calendarDayTextActive]}>{day.getDate()}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          style={styles.primaryCta}
          onPress={() => {
            const selected = toInputDate(sheet.selected.toISOString());
            if (sheet.type === 'startDate') {
              setStartDate(selected);
            } else {
              setEndDate(selected);
              setOngoing(false);
            }
            setPickerSheet(null);
          }}
        >
          <Text style={styles.primaryCtaText}>Set date</Text>
        </Pressable>
      </View>
    );
  };

  const renderTimeSheet = (sheet: Extract<PickerSheet, { type: 'time' }>) => {
    const current = times.find((slot) => slot.id === sheet.slotId)?.time24h ?? '08:00';
    return (
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Select reminder time</Text>
        <Text style={styles.sheetSubtitle}>Choose a time. No typing needed.</Text>
        <View style={styles.timeGrid}>
          {timeOptions.map((time) => (
            <Pressable
              key={time}
              style={[styles.timeOption, current === time && styles.timeOptionActive]}
              onPress={() => {
                updateTimeSlot(sheet.slotId, { time24h: time });
                setPickerSheet(null);
              }}
            >
              <Text style={[styles.timeOptionText, current === time && styles.timeOptionTextActive]}>{formatTime(time)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AppBackButton onPress={() => navigation.goBack()} iconOnly />
          <View>
            <Text style={styles.title}>{editing ? 'Edit Medication' : 'Add Medication'}</Text>
            <Text style={styles.subtitle}>Build a reminder plan</Text>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Medicine name</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="e.g. Metformin" placeholderTextColor={medicationTheme.muted} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Dosage form</Text>
          <View style={styles.rowWrap}>
            {medicationTypes.map((option) => (
              <Pressable key={option.type} style={[styles.typeChip, type === option.type && styles.typeChipActive]} onPress={() => setType(option.type)}>
                <Text style={[styles.typeIcon, type === option.type && styles.typeIconActive]}>{option.icon}</Text>
                <Text style={[styles.typeLabel, type === option.type && styles.typeLabelActive]}>{option.label}</Text>
                {type === option.type ? <Text style={styles.checkMark}>✓</Text> : null}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Strength</Text>
          <View style={styles.rowWrap}>
            {strengthOptions.map((option) => (
              <React.Fragment key={option}>{renderChoice(option, strength === option, () => setStrength(option))}</React.Fragment>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Dose quantity</Text>
          <View style={styles.quantityRow}>
            {quantityOptions.map((quantity) => (
              <React.Fragment key={quantity}>
                {renderChoice(
                  `${quantity} ${currentType.unit}${quantity === 1 ? '' : 's'}`,
                  doseQuantity === quantity,
                  () => setDoseQuantity(quantity),
                  styles.quantityChip
                )}
              </React.Fragment>
            ))}
          </View>
          <Text style={styles.helper}>Selected dose: {dosage}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Purpose / reason (optional)</Text>
          <TextInput value={purpose} onChangeText={setPurpose} style={styles.input} placeholder="e.g. Diabetes management" placeholderTextColor={medicationTheme.muted} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Frequency</Text>
          <View style={styles.stack}>
            {frequencyOptions.map((option) => (
              <React.Fragment key={option.key}>
                {renderChoice(option.label, frequencyPreset === option.key, () => setFrequencyPreset(option.key), styles.fullWidthChoice)}
              </React.Fragment>
            ))}
          </View>
          {frequencyPreset === 'every_x_days' ? (
            <TextInput value={intervalDays} onChangeText={setIntervalDays} style={styles.inputInline} keyboardType="number-pad" placeholder="Every X days" placeholderTextColor={medicationTheme.muted} />
          ) : null}
          {(frequencyPreset === 'specific_weekdays' || frequencyPreset === 'weekly') && (
            <View style={styles.weekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, idx) => (
                <Pressable key={`${label}-${idx}`} style={[styles.weekChip, weekdays.includes(idx) && styles.weekChipActive]} onPress={() => toggleWeekday(idx)}>
                  <Text style={[styles.weekText, weekdays.includes(idx) && styles.weekTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.field}>
          <View style={styles.inlineHeader}>
            <Text style={styles.label}>Scheduled times</Text>
            <Pressable onPress={addTimeSlot}><Text style={styles.link}>+ Add another time</Text></Pressable>
          </View>
          <View style={styles.stack}>
            {times.map((slot) => (
              <View key={slot.id} style={styles.timeRow}>
                <Pressable style={styles.selectorRow} onPress={() => setPickerSheet({ type: 'time', slotId: slot.id })}>
                  <Text style={styles.selectorLabel}>Reminder time</Text>
                  <Text style={styles.selectorValue}>{formatTime(slot.time24h)}</Text>
                </Pressable>
                <View style={styles.mealWrap}>
                  {mealOptions.map((meal) => (
                    <Pressable key={meal.key} style={[styles.mealChip, slot.mealRelation === meal.key && styles.mealChipActive]} onPress={() => updateTimeSlot(slot.id, { mealRelation: meal.key })}>
                      <Text style={[styles.mealText, slot.mealRelation === meal.key && styles.mealTextActive]}>{meal.label}</Text>
                      {slot.mealRelation === meal.key ? <Text style={styles.inlineCheckMark}>✓</Text> : null}
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
          <Pressable style={styles.selectorRow} onPress={() => openDateSheet('startDate')}>
            <Text style={styles.selectorLabel}>Start date</Text>
            <Text style={styles.selectorValue}>{displayDate(startDate)}</Text>
          </Pressable>
          <Pressable style={[styles.selectorRow, ongoing && styles.selectorRowDimmed]} onPress={() => openDateSheet('endDate')}>
            <Text style={styles.selectorLabel}>End date</Text>
            <Text style={styles.selectorValue}>{ongoing ? 'Ongoing / no end date' : displayDate(endDate)}</Text>
          </Pressable>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Ongoing medication</Text>
            <Switch
              value={ongoing}
              onValueChange={setOngoing}
              ios_backgroundColor={medicationTheme.surface}
              trackColor={{ false: medicationTheme.surface, true: medicationTheme.surfaceRaised }}
              thumbColor={ongoing ? medicationTheme.text : medicationTheme.muted}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Reminder sound</Text>
          <View style={styles.stack}>
            {soundOptions.map((option) => (
              <React.Fragment key={option.key}>
                {renderChoice(option.label, reminderSound === option.key, () => setReminderSound(option.key), styles.fullWidthChoice)}
              </React.Fragment>
            ))}
          </View>
          <Text style={styles.helper}>Preview uses platform default notification tone.</Text>
        </View>

        <Pressable
          disabled={!canSave}
          onPress={onSave}
          style={[styles.primaryCta, !canSave && styles.primaryCtaDisabled]}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryCtaText, !canSave && styles.primaryCtaTextDisabled]}>
            {editing ? 'Save Changes' : 'Save Medication'}
          </Text>
        </Pressable>
      </ScrollView>

      <Modal visible={pickerSheet !== null} transparent animationType="slide" onRequestClose={() => setPickerSheet(null)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setPickerSheet(null)} />
        {pickerSheet?.type === 'startDate' || pickerSheet?.type === 'endDate'
          ? renderCalendarSheet(pickerSheet)
          : pickerSheet?.type === 'time'
            ? renderTimeSheet(pickerSheet)
            : null}
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
    gap: 18
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  title: {
    fontFamily: font.bold,
    fontSize: 24,
    lineHeight: 30,
    color: medicationTheme.text
  },
  subtitle: {
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 20,
    color: medicationTheme.muted
  },
  field: {
    gap: 10
  },
  label: {
    fontFamily: font.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: medicationTheme.secondary
  },
  input: {
    borderWidth: 1,
    borderColor: medicationTheme.border,
    backgroundColor: medicationTheme.input,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: medicationTheme.text,
    fontFamily: font.medium,
    fontSize: 16
  },
  inputInline: {
    borderWidth: 1,
    borderColor: medicationTheme.border,
    backgroundColor: medicationTheme.input,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: medicationTheme.text,
    fontFamily: font.medium,
    fontSize: 16
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  typeChip: {
    width: '31%',
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: medicationTheme.border,
    backgroundColor: medicationTheme.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  typeChipActive: {
    borderColor: medicationTheme.borderStrong,
    backgroundColor: medicationTheme.surfaceRaised
  },
  typeIcon: {
    color: medicationTheme.secondary,
    fontFamily: font.bold,
    fontSize: 18
  },
  typeIconActive: {
    color: medicationTheme.text
  },
  typeLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 18,
    color: medicationTheme.secondary
  },
  typeLabelActive: {
    color: medicationTheme.text
  },
  checkMark: {
    position: 'absolute',
    right: 8,
    top: 6,
    fontFamily: font.bold,
    color: medicationTheme.text
  },
  choiceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: medicationTheme.border,
    backgroundColor: medicationTheme.card,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  choiceChipActive: {
    borderColor: medicationTheme.borderStrong,
    backgroundColor: medicationTheme.surfaceRaised
  },
  choiceText: {
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 20,
    color: medicationTheme.secondary
  },
  choiceTextActive: {
    color: medicationTheme.text
  },
  inlineCheckMark: {
    fontFamily: font.bold,
    color: medicationTheme.text
  },
  quantityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  quantityChip: {
    minWidth: '30%',
    justifyContent: 'center'
  },
  helper: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: medicationTheme.muted
  },
  fullWidthChoice: {
    justifyContent: 'space-between',
    minHeight: 54,
    borderRadius: 16
  },
  weekRow: {
    flexDirection: 'row',
    gap: 8
  },
  weekChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: medicationTheme.border,
    backgroundColor: medicationTheme.card,
    alignItems: 'center',
    justifyContent: 'center'
  },
  weekChipActive: {
    borderColor: medicationTheme.borderStrong,
    backgroundColor: medicationTheme.surfaceRaised
  },
  weekText: {
    fontFamily: font.medium,
    color: medicationTheme.secondary
  },
  weekTextActive: {
    color: medicationTheme.text
  },
  inlineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  link: {
    fontFamily: font.bold,
    fontSize: 14,
    color: medicationTheme.text
  },
  stack: {
    gap: 8
  },
  timeRow: {
    borderWidth: 1,
    borderColor: medicationTheme.border,
    borderRadius: radius.md,
    backgroundColor: medicationTheme.card,
    padding: 12,
    gap: 10
  },
  selectorRow: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: medicationTheme.border,
    borderRadius: radius.md,
    backgroundColor: medicationTheme.input,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  selectorRowDimmed: {
    opacity: 0.92
  },
  selectorLabel: {
    fontFamily: font.medium,
    fontSize: 14,
    color: medicationTheme.muted
  },
  selectorValue: {
    fontFamily: font.semiBold,
    fontSize: 16,
    color: medicationTheme.text,
    flexShrink: 1,
    textAlign: 'right'
  },
  mealWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  mealChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: medicationTheme.border,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  mealChipActive: {
    borderColor: medicationTheme.borderStrong,
    backgroundColor: medicationTheme.surfaceRaised
  },
  mealText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: medicationTheme.secondary
  },
  mealTextActive: {
    color: medicationTheme.text
  },
  delete: {
    fontFamily: font.semiBold,
    fontSize: 13,
    color: medicationTheme.danger
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  switchLabel: {
    fontFamily: font.medium,
    fontSize: 15,
    color: medicationTheme.secondary
  },
  primaryCta: {
    borderRadius: radius.pill,
    backgroundColor: medicationTheme.primary,
    borderWidth: 1,
    borderColor: medicationTheme.borderStrong,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: medicationTheme.primaryDark,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8
  },
  primaryCtaDisabled: {
    opacity: 0.45
  },
  primaryCtaText: {
    fontFamily: font.bold,
    fontSize: 17,
    color: medicationTheme.primaryText
  },
  primaryCtaTextDisabled: {
    color: medicationTheme.muted
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.62)'
  },
  sheet: {
    marginTop: 'auto',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: medicationTheme.card,
    borderTopWidth: 1,
    borderColor: medicationTheme.border,
    padding: 20,
    gap: 14
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: medicationTheme.borderStrong
  },
  sheetTitle: {
    fontFamily: font.bold,
    fontSize: 24,
    lineHeight: 30,
    color: medicationTheme.text
  },
  sheetSubtitle: {
    fontFamily: font.regular,
    fontSize: 14,
    color: medicationTheme.muted
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  calendarNav: {
    fontFamily: font.bold,
    fontSize: 32,
    color: medicationTheme.text,
    paddingHorizontal: 10
  },
  calendarTitle: {
    fontFamily: font.bold,
    fontSize: 18,
    color: medicationTheme.text
  },
  weekHeader: {
    flexDirection: 'row'
  },
  weekHeaderText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontFamily: font.semiBold,
    color: medicationTheme.muted
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0
  },
  calendarDay: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16
  },
  calendarDayActive: {
    backgroundColor: medicationTheme.surfaceRaised,
    borderWidth: 1,
    borderColor: medicationTheme.borderStrong
  },
  calendarDayText: {
    fontFamily: font.semiBold,
    fontSize: 16,
    color: medicationTheme.text
  },
  calendarDayMuted: {
    color: medicationTheme.muted,
    opacity: 0.46
  },
  calendarDayTextActive: {
    color: medicationTheme.text
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  timeOption: {
    width: '30%',
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: medicationTheme.border,
    backgroundColor: medicationTheme.surface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  timeOptionActive: {
    borderColor: medicationTheme.borderStrong,
    backgroundColor: medicationTheme.surfaceRaised
  },
  timeOptionText: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: medicationTheme.secondary
  },
  timeOptionTextActive: {
    color: medicationTheme.text
  }
});
