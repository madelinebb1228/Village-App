// react-native-web ships Alert.alert as a total no-op (see
// node_modules/react-native-web/dist/exports/Alert/index.js), so every
// validation error, save-failure message, and confirmation dialog in the
// app silently does nothing when running on web. This patches the shared
// Alert singleton so `import { Alert } from 'react-native'` behaves the
// same everywhere, without touching every call site.
import { Alert, Platform } from 'react-native';

if (Platform.OS === 'web') {
  Alert.alert = (title: string, message?: string, buttons?: any[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');

    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }

    const cancelIndex = buttons.findIndex(b => b.style === 'cancel');
    const confirmed = window.confirm(text);
    if (confirmed) {
      const confirmButton = buttons.find((_, i) => i !== cancelIndex) ?? buttons[buttons.length - 1];
      confirmButton?.onPress?.();
    } else if (cancelIndex !== -1) {
      buttons[cancelIndex]?.onPress?.();
    }
  };
}
