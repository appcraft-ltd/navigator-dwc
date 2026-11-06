import { useNavigation } from '@react-navigation/native';
import { Text, YStack, XStack, useTheme } from 'tamagui';
import { useLocation } from '../contexts/LocationContext';
import { useOrderManager } from '../contexts/OrderManagerContext';
import { humanize } from 'inflected';
import { get } from '../utils';
import OdometerNumber from '../components/OdometerNumber';
import useAppTheme from '../hooks/use-app-theme';
import { Platform, ScrollView } from 'react-native';
import DriverTrackingControl from '../components/DriverTrackingControl';

const WidgetContainer = ({ px = '$4', py = '$4', children, ...props }) => {
    const { isDarkMode } = useAppTheme();
    return (
        <YStack borderRadius='$6' bg='$surface' px={px} py={py} borderWidth={1} borderColor={isDarkMode ? '$transparent' : '$gray-300'} {...props}>
            {children}
        </YStack>
    );
};

const DriverDashboardScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { isTracking, location } = useLocation();
    const { allActiveOrders } = useOrderManager();

    return (
        <YStack flex={1} bg='$background'>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
                <YStack space='$4'>
                    <WidgetContainer>
                        {Platform.OS === 'android' ? <DriverTrackingControl /> : (
                        <XStack>
                            <YStack flex={1}>
                                <Text color='$textPrimary'>Tracking:</Text>
                            </YStack>
                            <YStack flex={1} alignItems='flex-end'>
                                <Text color={isTracking ? '$successBorder' : '$textSecondary'}>{isTracking ? 'Yes' : 'No'}</Text>
                            </YStack>
                        </XStack>
                        )}
                    </WidgetContainer>
                    <WidgetContainer>
                        <Text color='$textPrimary' fontWeight='bold' mb='$3'>
                            Location:
                        </Text>
                        <XStack flexWrap='wrap' gap='$3'>
                            {['latitude', 'longitude', 'heading', 'altitude'].map((key, index) => {
                                return (
                                    <YStack key={index} width='45%' overflow='hidden'>
                                        <Text color='$textSecondary'>{humanize(key)}:</Text>
                                        <Text color='$textPrimary' numberOfLines={1}>
                                            {get(location, `coords.${key}`)}
                                        </Text>
                                    </YStack>
                                );
                            })}
                        </XStack>
                    </WidgetContainer>
                </YStack>
                <XStack gap='$4'>
                    <WidgetContainer flex={1} alignItems='center' justifyContent='center'>
                        <YStack>
                            <Text color='$textPrimary' fontWeight='bold' mb='$2'>
                                Active Orders
                            </Text>
                        </YStack>
                        <YStack>
                            <OdometerNumber value={allActiveOrders.length} digitStyle={{ color: theme['$textSecondary'].val }} digitHeight={36} />
                        </YStack>
                    </WidgetContainer>
                    <WidgetContainer flex={1} alignItems='center' justifyContent='center'>
                        <YStack>
                            <Text color='$textPrimary' fontWeight='bold' mb='$2'>
                                Speed
                            </Text>
                        </YStack>
                        <YStack>
                            <OdometerNumber value={get(location, 'coords.speed', 0)} digitStyle={{ color: theme['$textSecondary'].val }} digitHeight={36} />
                        </YStack>
                    </WidgetContainer>
                </XStack>
            </ScrollView>
        </YStack>
    );
};

export default DriverDashboardScreen;
