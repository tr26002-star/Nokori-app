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
  background: '#FFF9F5',
  purple: '#7651A8',
  purpleDark: '#583887',
  green: '#65A889',
  text: '#403B43',
  muted: '#77717A',
  border: '#F0E8F3',
  white: '#FFFFFF',
  palePurple: '#F4EFF9',
};

export function Screen({ children, contentStyle }: { children: ReactNode; contentStyle?: ViewStyle }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View pointerEvents="none" style={styles.lavenderShape} />
      <View pointerEvents="none" style={styles.greenShape} />
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>◈</Text></View>
          <Text style={styles.brandName}>Nokory</Text>
        </View>
        {children}
      </ScrollView>
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
  lavenderShape: { position: 'absolute', right: -46, top: -65, width: 155, height: 190, borderBottomLeftRadius: 100, borderBottomRightRadius: 100, backgroundColor: '#F1E5F7', transform: [{ rotate: '-16deg' }] },
  greenShape: { position: 'absolute', left: -70, bottom: -105, width: 190, height: 200, borderTopRightRadius: 120, borderTopLeftRadius: 120, backgroundColor: '#DDEDB8', transform: [{ rotate: '35deg' }] },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 32 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 28 },
  brandMark: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
  brandMarkText: { color: palette.white, fontSize: 20, fontWeight: '800' },
  brandName: { color: palette.purple, fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  eyebrow: { color: palette.purple, fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' },
  heading: { marginBottom: 24 },
  title: { color: palette.purple, fontSize: 31, fontWeight: '800', lineHeight: 38 },
  description: { color: palette.muted, fontSize: 15, lineHeight: 23, marginTop: 9 },
  panel: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 20, borderWidth: 1, padding: 18, marginBottom: 14 },
  primaryButton: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 16, justifyContent: 'center', minHeight: 54, marginTop: 14, paddingHorizontal: 20 },
  primaryButtonText: { color: palette.white, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
  secondaryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 4 },
  secondaryButtonText: { color: palette.purple, fontSize: 15, fontWeight: '700' },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { color: palette.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 14, borderWidth: 1, color: palette.text, fontSize: 16, minHeight: 52, paddingHorizontal: 15 },
});
