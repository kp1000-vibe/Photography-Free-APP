import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AdsProvider } from '../lib/ads';
import { loadLibrary } from '../lib/library';
import { colors } from '../theme';

export default function RootLayout() {
  useEffect(() => {
    loadLibrary();
  }, []);

  return (
    <SafeAreaProvider>
      <AdsProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="gallery" options={{ animation: 'slide_from_left' }} />
          <Stack.Screen name="edit/[id]" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
          <Stack.Screen name="settings" options={{ animation: 'slide_from_bottom' }} />
        </Stack>
      </AdsProvider>
    </SafeAreaProvider>
  );
}
