import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Eyebrow, Screen, palette } from '../shared/screen-ui';
import { SymbolView } from 'expo-symbols';

type ReservationTab = 'active' | 'history';

export default function ReservationsScreen() {
  const [selectedTab, setSelectedTab] = useState<ReservationTab>('active');

  return (
    <Screen contentStyle={styles.screenContent} showBottomNav showBrand={false} showDecorations={false}>
      <Eyebrow>Tus rescates</Eyebrow>
      <Text style={styles.title}>Mis reservas</Text>

      <View accessibilityRole="tablist" style={styles.tabs}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: selectedTab === 'active' }}
          onPress={() => setSelectedTab('active')}
          style={[styles.tab, selectedTab === 'active' && styles.activeTab]}
        >
          <Text style={[styles.tabLabel, selectedTab === 'active' && styles.activeTabLabel]}>Activas</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: selectedTab === 'history' }}
          onPress={() => setSelectedTab('history')}
          style={[styles.tab, selectedTab === 'history' && styles.activeTab]}
        >
          <Text style={[styles.tabLabel, selectedTab === 'history' && styles.activeTabLabel]}>Historial</Text>
        </Pressable>
      </View>

      <View style={styles.emptyCard}>
        <View style={styles.ticketIcon}>
          <SymbolView
            name={{ ios: 'ticket.fill', android: 'confirmation_number', web: 'confirmation_number' }}
            tintColor={palette.purple}
            size={24}
          />
        </View>
        <Text style={styles.emptyTitle}>Aún no tienes reservas</Text>
        <Text style={styles.emptyDescription}>Cuando reserves un pack aparecerá aquí.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 28 },
  title: { color: palette.purpleDark, fontSize: 30, fontWeight: '700', lineHeight: 38, marginBottom: 34 },
  tabs: { borderBottomColor: palette.border, borderBottomWidth: 1, flexDirection: 'row', gap: 20 },
  tab: { alignItems: 'center', borderBottomColor: 'transparent', borderBottomWidth: 2, marginBottom: -1, minWidth: 76, paddingBottom: 12, paddingHorizontal: 3 },
  activeTab: { borderBottomColor: palette.purple },
  tabLabel: { color: palette.muted, fontSize: 14, fontWeight: '600' },
  activeTabLabel: { color: palette.purple, fontWeight: '800' },
  emptyCard: { alignItems: 'center', borderColor: '#DCCBE7', borderRadius: 19, borderStyle: 'dashed', borderWidth: 1.5, height: 315, justifyContent: 'center', marginTop: 24, paddingHorizontal: 20, paddingVertical: 28 },
  ticketIcon: { alignItems: 'center', backgroundColor: palette.palePurple, borderRadius: 17, height: 66, justifyContent: 'center', marginBottom: 17, width: 66 },
  emptyTitle: { color: palette.purpleDark, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 8, textAlign: 'center' },
});
