import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFF9F5' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="norms" />
      <Stack.Screen name="role-select" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="explore" />
      <Stack.Screen name="publish" />
      <Stack.Screen name="reservations" />
    </Stack>
  );
}
