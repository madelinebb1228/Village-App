import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { COUNTRIES, STATES_BY_COUNTRY, CITIES_BY_STATE } from '../../lib/villageData';

export function LocationPicker({
  country, state, city, search,
  onCountryChange, onStateChange, onCityChange, onSearchChange,
}: {
  country: string; state: string; city: string; search: string;
  onCountryChange: (c: string) => void;
  onStateChange:   (s: string) => void;
  onCityChange:    (c: string) => void;
  onSearchChange:  (t: string) => void;
}) {
  const c = useColors();
  const lp = useMemo(() => makeStyles(c), [c]);
  const stateList  = country ? (STATES_BY_COUNTRY[country] ?? []) : [];
  const cityList   = state   ? (CITIES_BY_STATE[state]    ?? []) : [];
  const hasStates  = stateList.length > 0;
  const hasCities  = cityList.length  > 0;

  const filteredStates = search
    ? stateList.filter(s => s.toLowerCase().includes(search.toLowerCase()))
    : stateList;
  const filteredCities = search
    ? cityList.filter(ct => ct.toLowerCase().includes(search.toLowerCase()))
    : cityList;

  return (
    <View>
      {/* Country */}
      <Text style={lp.label}>Country</Text>
      <View style={lp.grid}>
        {COUNTRIES.map(ct => (
          <TouchableOpacity
            key={ct}
            style={[lp.chip, country === ct && lp.chipSelected]}
            onPress={() => onCountryChange(ct)}
            activeOpacity={0.75}
          >
            <Text style={[lp.chipText, country === ct && lp.chipTextSelected]}>{ct}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* State / Province */}
      {hasStates && (
        <>
          <Text style={lp.label}>{country === 'Canada' ? 'Province' : 'State'}</Text>
          <TextInput
            style={lp.searchInput}
            placeholder={`Search ${country === 'Canada' ? 'provinces' : 'states'}...`}
            placeholderTextColor={c.textMuted}
            value={state ? '' : search}
            onChangeText={t => { onStateChange(''); onSearchChange(t); }}
            onFocus={() => { if (state) { onStateChange(''); } }}
          />
          <View style={lp.grid}>
            {filteredStates.map(st => (
              <TouchableOpacity
                key={st}
                style={[lp.chip, state === st && lp.chipSelected]}
                onPress={() => { onStateChange(st); onSearchChange(''); }}
                activeOpacity={0.75}
              >
                <Text style={[lp.chipText, state === st && lp.chipTextSelected]}>{st}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* City */}
      {hasCities && (
        <>
          <Text style={lp.label}>City</Text>
          <TextInput
            style={lp.searchInput}
            placeholder="Search cities..."
            placeholderTextColor={c.textMuted}
            value={city ? '' : search}
            onChangeText={t => { onCityChange(''); onSearchChange(t); }}
            onFocus={() => { if (city) { onCityChange(''); } }}
          />
          <View style={lp.grid}>
            {filteredCities.map(ct => (
              <TouchableOpacity
                key={ct}
                style={[lp.chip, city === ct && lp.chipSelected]}
                onPress={() => { onCityChange(ct); onSearchChange(''); }}
                activeOpacity={0.75}
              >
                <Text style={[lp.chipText, city === ct && lp.chipTextSelected]}>{ct}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {state && (
            <TouchableOpacity style={lp.requestBtn} activeOpacity={0.75}>
              <Text style={lp.requestBtnText}>🏙️ My city isn't listed — request to add it</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    label: {
      fontSize: 13, fontWeight: '700', color: c.textMuted,
      marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5,
    },
    searchInput: {
      backgroundColor: c.card, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator,
      paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: c.textPrimary, marginBottom: 8,
    },
    grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.bgAlt, borderWidth: 1.5, borderColor: c.cardBorder },
    chipSelected: { backgroundColor: c.optionSelected, borderColor: c.optionSelectedBorder },
    chipText:   { fontSize: 13, color: c.textSecondary, fontWeight: '500' },
    chipTextSelected: { color: c.textPrimary, fontWeight: '700' },
    requestBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, borderStyle: 'dashed' },
    requestBtnText: { fontSize: 13, color: c.textMuted, fontWeight: '500' },
  });
}
