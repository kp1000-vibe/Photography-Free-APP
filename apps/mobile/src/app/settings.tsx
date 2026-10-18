import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../components/IconButton';
import { AdBanner, useAds } from '../lib/ads';
import { colors, radius, space, type } from '../theme';

const WEBSITE = (Constants.expoConfig?.extra?.websiteUrl as string | undefined) ?? 'https://lumen-camera.vercel.app';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const ads = useAds();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton label="Close settings" onPress={() => router.back()}>
          Done
        </IconButton>
        <Text style={styles.title} accessibilityRole="header">
          Settings
        </Text>
        <View style={{ width: 64 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Free, forever">
          <Text style={styles.body}>
            Every filter and tool in Lumen is free. There are no subscriptions, purchases or watermarks. Lumen is paid for by a small number of
            ads, which never appear on the camera or while you edit.
          </Text>
        </Section>

        <Section title="Privacy">
          <Text style={styles.body}>
            Photos are processed on your phone and never uploaded. Lumen has no account and collects no analytics. The ad provider (Google
            AdMob) may collect device data to show ads, as described in the privacy policy.
          </Text>
          <Text style={styles.meta}>
            Ads: {ads.mode === 'off' ? 'disabled in this build' : ads.ready ? (ads.nonPersonalized ? 'non-personalized' : 'personalized') : 'not loaded'}
            {ads.mode === 'test' ? ' (test ads)' : ''}
          </Text>
          {ads.privacyOptionsRequired && <Row label="Ad privacy choices" onPress={ads.showPrivacyOptions} />}
          <Row label="Privacy policy" onPress={() => Linking.openURL(`${WEBSITE}/privacy`)} />
          <Row label="Terms of use" onPress={() => Linking.openURL(`${WEBSITE}/terms`)} />
        </Section>

        <Section title="Help">
          <Row label="Support" onPress={() => Linking.openURL(`${WEBSITE}/support`)} />
          <Row label="Camera or photo access" onPress={() => Linking.openSettings()} />
        </Section>

        <Text style={styles.version}>Lumen {Constants.expoConfig?.version}</Text>
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom }}>
        <AdBanner context="settings" />
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} accessibilityRole="link">
      <Text style={styles.rowText}>{label}</Text>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm },
  title: { ...type.label, color: colors.text, fontSize: 17 },
  content: { padding: space.lg, gap: space.xl },
  section: { gap: space.sm },
  sectionTitle: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  body: { ...type.body, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: space.lg },
  rowText: { ...type.body, color: colors.text },
  chev: { ...type.title, color: colors.textMuted },
  version: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
});
