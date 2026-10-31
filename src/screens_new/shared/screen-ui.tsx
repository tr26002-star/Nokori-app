import { usePathname, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const palette = {
  background: '#FBFAF8',
  purple: '#562A80',
  purpleDark: '#452064',
  green: '#67914E',
  text: '#37313B',
  muted: '#827A86',
  border: '#ECE5EF',
  white: '#FFFFFF',
  palePurple: '#F3EAF7',
};

const bottomNavItems = [
  { route: '/explore', label: 'Productos', ios: 'shippingbox.fill', icon: 'inventory_2' },
  { route: '/publish', label: 'Publicar', ios: 'plus.square.fill', icon: 'add_box' },
  { route: '/profile', label: 'Perfil', ios: 'person.crop.circle.fill', icon: 'account_circle' },
] as const;

const clientNavItems = [
  { route: '/client-explore', label: 'Explorar', ios: 'safari.fill', icon: 'explore' },
  { route: '/reservations', label: 'Reservas', ios: 'ticket.fill', icon: 'confirmation_number' },
  { route: '/profile', label: 'Perfil', ios: 'person.crop.circle.fill', icon: 'account_circle' },
] as const;

export function Screen({ children, contentStyle, showBottomNav = false, showBrand = true, showDecorations = true, navVariant = 'seller' }: { children: ReactNode; contentStyle?: ViewStyle; showBottomNav?: boolean; showBrand?: boolean; showDecorations?: boolean; navVariant?: 'seller' | 'client' }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <SafeAreaView style={styles.safeArea}>
      {showDecorations ? <View pointerEvents="none" style={styles.lavenderShape} /> : null}
      {showDecorations ? <View pointerEvents="none" style={styles.greenShape} /> : null}
      <ScrollView
        contentContainerStyle={[styles.content, showBottomNav && styles.contentWithNav, contentStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {showBrand ? (
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><SymbolView name={{ ios: 'leaf.fill', android: 'eco', web: 'eco' }} tintColor={palette.white} size={18} /></View>
            <Text style={styles.brandName}>Nokory</Text>
          </View>
        ) : null}
        {children}
      </ScrollView>
      {showBottomNav ? (
        <View style={styles.bottomNav}>
          {(navVariant === 'client' ? clientNavItems : bottomNavItems).map((item) => {
            const active = pathname === item.route;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={item.route}
                onPress={() => router.replace(navVariant === 'client' && item.route === '/profile' ? { pathname: '/profile', params: { role: 'client' } } : item.route)}
                style={styles.navItem}
              >
                <SymbolView
                  name={{ ios: item.ios, android: item.icon, web: item.icon }}
                  tintColor={active ? palette.purple : palette.muted}
                  size={21}
                />
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function Field({ label, style: inputStyle, containerStyle, ...props }: TextInputProps & { label: string; containerStyle?: ViewStyle }) {
  return (
    <View style={[styles.fieldGroup, containerStyle]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor="#A39BA7"
        style={[styles.input, inputStyle]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background, overflow: 'hidden' },
  lavenderShape: { position: 'absolute', right: -49, top: -55, width: 145, height: 165, borderBottomLeftRadius: 95, borderBottomRightRadius: 95, backgroundColor: '#F0E4F4', transform: [{ rotate: '-17deg' }] },
  greenShape: { position: 'absolute', left: -77, bottom: -96, width: 185, height: 185, borderTopRightRadius: 120, borderTopLeftRadius: 120, backgroundColor: '#DDEDB9', transform: [{ rotate: '36deg' }] },
  content: { alignSelf: 'center', flexGrow: 1, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 32, width: '100%', maxWidth: 560 },
  contentWithNav: { paddingBottom: 24 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 31 },
  brandMark: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
  brandName: { color: palette.purple, fontSize: 20, fontWeight: '900' },
  eyebrow: { color: palette.green, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10, textTransform: 'uppercase' },
  heading: { marginBottom: 24 },
  title: { color: palette.purpleDark, fontSize: 28, fontWeight: '700', lineHeight: 35 },
  description: { color: palette.muted, fontSize: 15, lineHeight: 23, marginTop: 9 },
  panel: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 18, borderWidth: 1, padding: 18, marginBottom: 14 },
  primaryButton: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 12, justifyContent: 'center', minHeight: 54, marginTop: 14, paddingHorizontal: 20 },
  primaryButtonText: { color: palette.white, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
  secondaryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 4 },
  secondaryButtonText: { color: palette.purple, fontSize: 15, fontWeight: '700' },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { color: palette.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 11, borderWidth: 1, color: palette.text, fontSize: 15, minHeight: 48, paddingHorizontal: 13 },
  bottomNav: { alignSelf: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 16, borderWidth: 1, elevation: 3, flexDirection: 'row', justifyContent: 'space-around', marginBottom: 6, maxWidth: 520, minHeight: 62, paddingHorizontal: 7, paddingVertical: 6, shadowColor: '#493354', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8, width: '94%' },
  navItem: { alignItems: 'center', borderRadius: 11, flex: 1, gap: 3, justifyContent: 'center' },
  navLabel: { color: palette.muted, fontSize: 10, fontWeight: '600' },
  navLabelActive: { color: palette.purpleDark, fontWeight: '800' },
});
