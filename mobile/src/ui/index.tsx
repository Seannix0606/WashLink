import { brandColors, radius, spacing } from '@washlink/shared'
import type { ReactElement, ReactNode } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export const colors = brandColors

interface ScreenProps {
  readonly children: ReactNode
  readonly onRefresh?: () => void
  readonly isRefreshing?: boolean
}

export function Screen({ children, onRefresh, isRefreshing = false }: ScreenProps): ReactElement {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand700} /> : undefined}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

export function Title({ children }: { readonly children: ReactNode }): ReactElement {
  return <Text accessibilityRole="header" style={styles.title}>{children}</Text>
}

export function Heading({ children }: { readonly children: ReactNode }): ReactElement {
  return <Text accessibilityRole="header" style={styles.heading}>{children}</Text>
}

export function Body({ children, muted = false }: { readonly children: ReactNode; readonly muted?: boolean }): ReactElement {
  return <Text style={muted ? styles.muted : styles.body}>{children}</Text>
}

interface ButtonProps {
  readonly label: string
  readonly onPress: () => void
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  readonly isLoading?: boolean
  readonly isDisabled?: boolean
  readonly accessibilityHint?: string
}

export function Button({ label, onPress, variant = 'primary', isLoading = false, isDisabled = false, accessibilityHint }: ButtonProps): ReactElement {
  const disabled = isLoading || isDisabled
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: isLoading }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, buttonVariants[variant], disabled && styles.disabled, pressed && styles.pressed]}
    >
      {isLoading ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#ffffff' : colors.brand700} /> : null}
      <Text style={variant === 'primary' || variant === 'danger' ? styles.buttonTextLight : styles.buttonText}>{label}</Text>
    </Pressable>
  )
}

interface FieldProps extends TextInputProps {
  readonly label: string
  readonly helper?: string
  readonly error?: string | null
}

export function Field({ label, helper, error, ...input }: FieldProps): ReactElement {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.ink500} style={[styles.input, error ? styles.inputError : null]} {...input} />
      {helper ? <Text style={styles.muted}>{helper}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  )
}

export function Card({ children }: { readonly children: ReactNode }): ReactElement {
  return <View style={styles.card}>{children}</View>
}

interface ChoiceProps {
  readonly label: string
  readonly detail?: string
  readonly isSelected: boolean
  readonly isDisabled?: boolean
  readonly onPress: () => void
  readonly isCheckbox?: boolean
}

export function Choice({ label, detail, isSelected, isDisabled = false, onPress, isCheckbox = false }: ChoiceProps): ReactElement {
  return (
    <Pressable
      accessibilityRole={isCheckbox ? 'checkbox' : 'radio'}
      accessibilityLabel={isDisabled ? `${label}, unavailable` : label}
      accessibilityState={{ checked: isSelected, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={[styles.choice, isSelected && styles.choiceSelected, isDisabled && styles.disabled]}
    >
      <Text style={[styles.choiceLabel, isDisabled && styles.strike]}>{isSelected ? `✓ ${label}` : label}</Text>
      {detail ? <Text style={styles.muted}>{detail}</Text> : null}
    </Pressable>
  )
}

export function Badge({ label, tone = 'info' }: { readonly label: string; readonly tone?: 'info' | 'success' | 'warning' }): ReactElement {
  const tones = { info: colors.brand800, success: colors.success600, warning: colors.warning600 }
  return <Text style={[styles.badge, { color: tones[tone], borderColor: tones[tone] }]}>{label}</Text>
}

export function Notice({ message, tone = 'info' }: { readonly message: string | null; readonly tone?: 'info' | 'error' }): ReactElement | null {
  if (message === null) {
    return null
  }
  return <Text accessibilityRole={tone === 'error' ? 'alert' : 'text'} accessibilityLiveRegion="polite" style={tone === 'error' ? styles.error : styles.body}>{message}</Text>
}

export function Row({ children }: { readonly children: ReactNode }): ReactElement {
  return <View style={styles.row}>{children}</View>
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 26, fontWeight: '700', color: colors.ink900 },
  heading: { fontSize: 18, fontWeight: '600', color: colors.ink900 },
  body: { fontSize: 16, lineHeight: 23, color: colors.ink700 },
  muted: { fontSize: 14, lineHeight: 20, color: colors.ink500 },
  button: { minHeight: 48, borderRadius: radius.control, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.ink900 },
  buttonTextLight: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '500', color: colors.ink900 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.ink300, borderRadius: radius.control, paddingHorizontal: spacing.md, fontSize: 16, color: colors.ink900, backgroundColor: colors.surface },
  inputError: { borderColor: colors.danger600 },
  error: { fontSize: 14, lineHeight: 20, color: colors.danger600 },
  card: { backgroundColor: colors.surface, borderRadius: radius.surface, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.ink200 },
  choice: { minHeight: 48, justifyContent: 'center', gap: 2, borderWidth: 1, borderColor: colors.ink200, borderRadius: radius.control, padding: spacing.md, backgroundColor: colors.surface },
  choiceSelected: { borderColor: colors.brand700, backgroundColor: colors.brand50 },
  choiceLabel: { fontSize: 16, fontWeight: '500', color: colors.ink900 },
  strike: { textDecorationLine: 'line-through' },
  badge: { alignSelf: 'flex-start', fontSize: 13, fontWeight: '600', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
})

const buttonVariants = StyleSheet.create({
  primary: { backgroundColor: colors.brand700 },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink300 },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger600 },
})
