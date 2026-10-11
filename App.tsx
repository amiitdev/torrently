import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation';
import { useEngineBootstrap } from './src/hooks/useEngine';
import { colors } from './src/theme';

function App(): React.JSX.Element {
  useEngineBootstrap();

  return (
    <SafeAreaProvider style={styles.root}>
      <View style={styles.root}>
        <AppNavigator />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default App;
