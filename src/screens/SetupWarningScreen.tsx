import React from 'react';
import { SafeAreaView } from 'react-native';
import { Text, YStack } from 'tamagui';

export default function SetupWarningScreen() {
    return <SafeAreaView style={{ flex: 1, backgroundColor: '#111827' }}>
        <YStack flex={1} justifyContent='center' padding='$5' space='$3'>
            <Text color='white' fontSize='$7'>FullSend Driver is not configured</Text>
            <Text color='$gray-300'>Ask your dispatcher for the current signed app download.</Text>
        </YStack>
    </SafeAreaView>;
}
