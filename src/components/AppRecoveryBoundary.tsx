import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export class RecoveryBoundary extends React.Component<any, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch() { console.warn('NAVIGATOR_SCREEN_RENDER_FAILED'); }
    render() {
        if (!this.state.failed) return this.props.children;
        return <View style={styles.screen} accessibilityRole='alert'>
            <Text style={styles.title}>Unable to open this screen</Text>
            <Text style={styles.message}>Your login and saved delivery photos are kept. Try opening the screen again.</Text>
            <Pressable accessibilityRole='button' style={styles.button} onPress={() => this.setState({ failed: false })}><Text style={styles.buttonText}>Try again</Text></Pressable>
            <Pressable accessibilityRole='button' style={styles.button} onPress={this.props.onSignOut}><Text style={styles.buttonText}>Sign out</Text></Pressable>
        </View>;
    }
}

export default function AppRecoveryBoundary({ children }) {
    const { logout, driver } = useAuth();
    return <RecoveryBoundary key={driver?.id || 'signed-out'} onSignOut={logout}>{children}</RecoveryBoundary>;
}

const styles = StyleSheet.create({
    screen: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#111827', gap: 18 },
    title: { color: '#ffffff', fontSize: 23, fontWeight: '700' },
    message: { color: '#d1d5db', fontSize: 16, lineHeight: 24 },
    button: { padding: 16, borderRadius: 10, backgroundColor: '#1f2937' },
    buttonText: { color: '#ffffff', fontSize: 16, textAlign: 'center', fontWeight: '600' },
});
