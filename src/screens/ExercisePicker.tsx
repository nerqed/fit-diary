import { useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Exercise } from '../features/workouts/model';
import { Colors, Radii, Spacing, Typography } from '../theme';
import { PrimaryButton } from './ui';

type Props = Readonly<{
  exercises: readonly Exercise[];
  onPick: (exercise: Exercise) => void | Promise<void>;
  onCancel: () => void;
  onCreate?: (name: string) => Promise<Exercise>;
}>;

function searchable(text: string) {
  return text.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
}

/** Shared by the template editor and exercise replacement during a session. */
export function ExercisePicker({ exercises, onPick, onCancel, onCreate }: Props) {
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const query = searchable(search);
  const matches = useMemo(() => exercises.filter((exercise) =>
    !exercise.archived && [exercise.name, ...exercise.aliases].some((name) => searchable(name).includes(query))
  ), [exercises, query]);
  const canCreate = onCreate && query.length > 0 && !matches.some((item) => searchable(item.name) === query);

  async function select(exercise?: Exercise) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const selected = exercise ?? await onCreate?.(search.trim());
      if (selected) await onPick(selected);
    } catch (error) {
      Alert.alert('Не удалось выбрать упражнение', error instanceof Error ? error.message : 'Попробуйте ещё раз.');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <Modal visible presentationStyle="pageSheet" animationType="slide"
      onRequestClose={() => { if (!busy.current) onCancel(); }}>
      <SafeAreaView style={styles.sheet}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>Упражнения</Text>
          <Pressable accessibilityRole="button" disabled={pending} style={styles.close} onPress={onCancel}>
            <Text style={styles.link}>Закрыть</Text>
          </Pressable>
        </View>
        <TextInput value={search} onChangeText={setSearch} style={styles.search}
          placeholder="Найти упражнение" placeholderTextColor={Colors.muted} accessibilityLabel="Найти упражнение"
          clearButtonMode="while-editing" returnKeyType="search" maxLength={200} />
        {canCreate && <PrimaryButton secondary disabled={pending}
          title={`Создать «${search.trim()}»`} onPress={() => { void select(); }} />}
        <FlatList data={matches} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag" contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.hint}>В справочнике нет совпадений.</Text>}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" disabled={pending} style={styles.item}
              onPress={() => { void select(item); }}>
              <Text style={styles.itemName}>{item.name}</Text>
              {item.origin === 'custom' && <Text style={styles.hint}>Своё</Text>}
            </Pressable>
          )} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: Spacing.page, paddingTop: Spacing.l, gap: Spacing.m, backgroundColor: Colors.bg },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  title: { flex: 1, ...Typography.h2, color: Colors.ink },
  close: { justifyContent: 'center', minHeight: 44 },
  link: { ...Typography.subheadSemibold, color: Colors.ink },
  search: { ...Typography.body, color: Colors.ink, padding: Spacing.m, borderRadius: Radii.s, backgroundColor: Colors.card },
  list: { paddingBottom: Spacing.xl },
  item: { gap: Spacing.xs, paddingVertical: Spacing.m, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line },
  itemName: { ...Typography.body, color: Colors.ink },
  hint: { ...Typography.caption, color: Colors.muted },
});
