import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../components/IconButton';
import { AdBanner } from '../lib/ads';
import { addPhoto, useLibrary } from '../lib/library';
import { colors, radius, space, type } from '../theme';

const COLUMNS = 3;
const GAP = 2;

export default function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { items, loaded } = useLibrary();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tile = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  const importPhoto = async () => {
    setError(null);
    try {
      // The system picker needs no library permission and only shares the chosen photo.
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
      if (result.canceled || !result.assets[0]) return;
      setImporting(true);
      const item = await addPhoto(result.assets[0].uri);
      router.push({ pathname: '/edit/[id]', params: { id: item.id } });
    } catch {
      setError('Couldn’t import that photo. There may not be enough storage space.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton label="Back to camera" onPress={() => router.back()}>
          Camera
        </IconButton>
        <Text style={styles.title} accessibilityRole="header">
          Photos
        </Text>
        <IconButton label="Settings" onPress={() => router.push('/settings')}>
          Settings
        </IconButton>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.import} onPress={importPhoto} disabled={importing} accessibilityRole="button">
          {importing ? <ActivityIndicator color={colors.accentText} /> : <Text style={styles.importText}>Edit a photo from library</Text>}
        </Pressable>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      {!loaded ? (
        <View style={styles.grid}>
          {Array.from({ length: 9 }).map((_, i) => (
            <View key={i} style={[styles.skeleton, { width: tile, height: tile }]} />
          ))}
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No photos yet</Text>
          <Text style={styles.emptyBody}>Photos you take with Lumen appear here so you can re-edit them anytime. They’re also saved to your photo library.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ gap: GAP }}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/edit/[id]', params: { id: item.id } })}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Photo ${index + 1}, taken ${new Date(item.createdAt).toLocaleString()}. Open editor.`}
            >
              <Image
                source={{ uri: item.exportedUri ?? item.originalUri }}
                style={{ width: tile, height: tile, backgroundColor: colors.surface }}
                contentFit="cover"
                recyclingKey={item.id}
                transition={120}
              />
            </Pressable>
          )}
        />
      )}

      <View style={{ paddingBottom: insets.bottom }}>
        <AdBanner context="gallery" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm },
  title: { ...type.label, color: colors.text, fontSize: 17 },
  actions: { padding: space.lg, gap: space.sm },
  import: { height: 48, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  importText: { ...type.label, color: colors.accentText },
  error: { ...type.caption, color: colors.danger },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  skeleton: { backgroundColor: colors.surface },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.sm },
  emptyTitle: { ...type.title, color: colors.text },
  emptyBody: { ...type.body, color: colors.textMuted, textAlign: 'center' },
});
