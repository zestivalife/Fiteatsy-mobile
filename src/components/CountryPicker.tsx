import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { COUNTRIES, type CountryOption } from '../data/countries';
import { getThemeColors, radius, shadows, spacing, typography } from '../design/tokens';
import { useAppContext } from '../state/AppContext';

type Props = {
  selectedCountry: CountryOption;
  onSelect: (country: CountryOption) => void;
};

export const CountryPicker = ({ selectedCountry, onSelect }: Props) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredCountries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return COUNTRIES;
    return COUNTRIES.filter((country) => {
      return (
        country.name.toLowerCase().includes(normalized) ||
        country.iso2.toLowerCase().includes(normalized) ||
        country.dialCode.includes(normalized.replace(/\s/g, ''))
      );
    });
  }, [query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <View style={styles.wrapper}>
        <Text style={[styles.label, { color: palette.textPrimary }]}>Country</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Selected country ${selectedCountry.name}, dial code ${selectedCountry.dialCode}`}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.selector,
            {
              backgroundColor: palette.cardMuted,
              borderColor: palette.stroke
            },
            pressed && styles.pressed
          ]}
        >
          <Text style={styles.flag}>{selectedCountry.flag}</Text>
          <View style={styles.selectorText}>
            <Text style={[styles.countryName, { color: palette.textPrimary }]}>{selectedCountry.name}</Text>
            <Text style={[styles.dialCode, { color: palette.textSecondary }]}>{selectedCountry.dialCode}</Text>
          </View>
          <Text style={[styles.chevron, { color: palette.textMuted }]}>⌄</Text>
        </Pressable>
      </View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: palette.textPrimary }]}>Select country</Text>
                <Text style={[styles.sheetSubtitle, { color: palette.textSecondary }]}>Choose the dial code for WhatsApp OTP.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close country picker" onPress={close} style={styles.closeButton}>
                <Text style={[styles.closeText, { color: palette.textPrimary }]}>Close</Text>
              </Pressable>
            </View>

            <TextInput
              accessibilityLabel="Search countries"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Search by country or dial code"
              placeholderTextColor={palette.textMuted}
              value={query}
              onChangeText={setQuery}
              style={[
                styles.searchInput,
                {
                  backgroundColor: palette.cardMuted,
                  borderColor: palette.stroke,
                  color: palette.textPrimary
                }
              ]}
            />

            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.iso2}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.countryList}
              renderItem={({ item }) => {
                const selected = item.iso2 === selectedCountry.iso2;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${item.name}, ${item.dialCode}`}
                    onPress={() => {
                      onSelect(item);
                      close();
                    }}
                    style={({ pressed }) => [
                      styles.countryRow,
                      { borderColor: palette.stroke },
                      selected && { backgroundColor: palette.blueSoft, borderColor: palette.blue },
                      pressed && styles.pressed
                    ]}
                  >
                    <Text style={styles.flag}>{item.flag}</Text>
                    <View style={styles.countryCopy}>
                      <Text style={[styles.countryName, { color: palette.textPrimary }]}>{item.name}</Text>
                      <Text style={[styles.dialCode, { color: palette.textSecondary }]}>{item.dialCode}</Text>
                    </View>
                    {selected ? <Text style={[styles.selectedMark, { color: palette.blue }]}>Selected</Text> : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: palette.textSecondary }]}>No countries match your search.</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    gap: 6
  },
  label: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  selector: {
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: 14
  },
  pressed: {
    opacity: 0.86
  },
  flag: {
    fontSize: 24
  },
  selectorText: {
    flex: 1
  },
  countryCopy: {
    flex: 1,
    gap: 2
  },
  countryName: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  dialCode: {
    ...typography.caption
  },
  chevron: {
    ...typography.bodyStrong,
    fontSize: 18
  },
  modalBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    flex: 1,
    justifyContent: 'flex-end'
  },
  sheet: {
    ...shadows.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    maxHeight: '82%',
    padding: spacing.lg
  },
  sheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginBottom: spacing.md
  },
  sheetTitle: {
    ...typography.title,
    fontSize: 22
  },
  sheetSubtitle: {
    ...typography.caption
  },
  closeButton: {
    paddingHorizontal: 4,
    paddingVertical: 4
  },
  closeText: {
    ...typography.caption,
    fontFamily: 'Exo_700Bold'
  },
  searchInput: {
    borderRadius: radius.sm,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 14
  },
  countryList: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl
  },
  countryRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  selectedMark: {
    ...typography.caption,
    fontFamily: 'Exo_700Bold'
  },
  emptyText: {
    ...typography.caption,
    paddingVertical: spacing.lg,
    textAlign: 'center'
  }
});
