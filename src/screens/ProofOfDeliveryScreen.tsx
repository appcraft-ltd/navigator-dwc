import { useState, useRef, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Image, Text, YStack, XStack, Spinner, useTheme } from 'tamagui';
import { Order, Place } from '@fleetbase/sdk';
import { titleize } from 'inflected';
import { SectionHeader, SectionInfoLine } from '../components/Content';
import { isNone, resizePhoto } from '../utils';
import { sendMultipart } from '../utils/delivery-confirmations';
import RNFS from 'react-native-fs';
import { toast } from '../utils/toast';
import { useTempStore } from '../contexts/TempStoreContext';
import useDimensions from '../hooks/use-dimensions';
import useFleetbase from '../hooks/use-fleetbase';
import useAppTheme from '../hooks/use-app-theme';
import QrCodeScanner from '../components/QrCodeScanner';
import CameraCapture from '../components/CameraCapture';
import BackButton from '../components/BackButton';
import CustomHeader from '../components/CustomHeader';
import LoadingOverlay from '../components/LoadingOverlay';
import SignatureCanvas from 'react-native-signature-canvas';

const ProofOfDeliveryScreen = ({ route }) => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { isDarkMode } = useAppTheme();
    const { adapter } = useFleetbase();
    const { setValue } = useTempStore();
    const { screenWidth, screenHeight } = useDimensions();
    const [isLoading, setIsLoading] = useState(false);
    const [loadingOverlayMessage, setLoadingOverlayMessage] = useState('Capturing Proof of Delivery...');
    const signatureScreenRef = useRef();
    const params = route.params ?? {};
    const activity = params.activity;
    const order = new Order(params.order, adapter);
    const waypoint = new Place(params.waypoint, adapter);
    const entity = params.entity;
    const method = activity.pod_method;
    const isWaypointActivity = waypoint && typeof waypoint.getAttribute('tracking') === 'string' && waypoint.getAttribute('tracking').length;
    const subject = entity ?? (isWaypointActivity ? waypoint : order);

    const signatureWebStyle = `.m-signature-pad { box-shadow: none; border: none; }
              .m-signature-pad--body { border: none; }
              .m-signature-pad--footer { position: absolute; bottom: 0; left: 0; right: 0; min-height: 80px; padding-bottom: 2rem; padding-top: 1.75rem; border-top: 1px ${theme['$borderColor'].val} solid; background-color: ${theme['$surface'].val} }
              .m-signature-pad--footer > .button { background-color: 'transparent'; font-size: 0.75rem; color: ${theme['$textPrimary'].val}; }
              .m-signature-pad--footer > .description { font-size: 0.75rem; color: ${theme['$textSecondary'].val}; }
              body,html { width: ${screenWidth}px; height: ${screenHeight}px; }`;

    const handleQrCodeScan = useCallback(
        async (data) => {
            setIsLoading(true);

            try {
                const proof = await order.captureQrCode(subject, { code: data.value, data, waypoint: waypoint?.id });
                setValue('proof', { proof, activity, order: order.id, waypoint: waypoint?.id, entity: entity?.id });
                navigation.goBack();
            } catch (err) {
                toast.error(err.message ?? 'Unable to validate captured QR Code.');
                console.warn('Error capturing QR code as proof:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [navigation]
    );

    const handleSignatureCompleted = useCallback(
        async (signature) => {
            setIsLoading(true);

            try {
                const proof = await order.captureSignature(subject, { signature });
                setValue('proof', { proof, activity, order: order.id, waypoint: waypoint?.id, entity: entity?.id });
                navigation.goBack();
            } catch (err) {
                toast.error(err.message ?? 'Something went wrong saving the signature.');
                console.warn('Error capturing signature as proof:', err);
            } finally {
                setIsLoading(false);
            }
        },
        [navigation]
    );

    const handlePhotosCaptured = useCallback(
        async (photos = []) => {
            if (!photos.length || isLoading) return;
            setIsLoading(true);
            const resizedPhotos = [];
            try {
                setLoadingOverlayMessage('Preparing photos…');
                // Bound peak memory and send real file parts, never JSON/base64.
                for (const photo of photos.slice(0, 10)) {
                    const uri = await resizePhoto(photo.uri);
                    if (!uri) throw new Error('Unable to prepare photo. Please take another photo.');
                    resizedPhotos.push({ uri, original: photo.uri });
                }
                const form = new FormData();
                resizedPhotos.forEach((photo, i) => form.append(`photos[${i}]`, { uri: photo.uri, name: `photo-${i}.jpg`, type: 'image/jpeg' }));
                const suffix = subject?.id && subject.id !== order.id ? `/${subject.id}` : '';
                const proof = await sendMultipart(adapter, `orders/${order.id}/capture-photo${suffix}`, form, (percent) =>
                    setLoadingOverlayMessage(percent === 100 ? 'Saving photos…' : percent === null ? 'Uploading photos…' : `Uploading photos: ${percent}%`));
                setValue('proof', { proof, activity, order: order.id, waypoint: waypoint?.id, entity: entity?.id });
                navigation.goBack();
            } catch (err) {
                toast.error(err.message ?? 'Unable to upload captured photos.');
            } finally {
                for (const photo of resizedPhotos) if (photo.uri !== photo.original) await RNFS.unlink(photo.uri.replace('file://', '')).catch(() => {});
                setIsLoading(false);
            }
        },
        [adapter, navigation, order.id, subject?.id, isLoading]
    );

    if (method === 'scan') {
        return (
            <YStack bg='transparent' flex={1}>
                <LoadingOverlay visible={isLoading} text={loadingOverlayMessage} textColor={isDarkMode ? '$textPrimary' : '$white'} />
                <CustomHeader headerTransparent={true} headerShadowVisible={false} headerLeft={<BackButton />} headerLeftStyle={{ paddingLeft: 10 }} />
                <QrCodeScanner onScan={handleQrCodeScan} />
            </YStack>
        );
    }

    if (method === 'photo') {
        return (
            <YStack bg='transparent' flex={1} position='relative'>
                <LoadingOverlay visible={isLoading} text={loadingOverlayMessage} textColor={isDarkMode ? '$textPrimary' : '$white'} />
                <CustomHeader
                    headerTransparent={true}
                    headerShadowVisible={false}
                    headerLeft={<BackButton />}
                    headerLeftStyle={{ paddingLeft: 10 }}
                    headerStyle={{ position: 'absolute', top: 0, left: 0, right: 0 }}
                />
                <CameraCapture onDone={handlePhotosCaptured} />
            </YStack>
        );
    }

    if (method === 'signature') {
        return (
            <YStack bg='$white' flex={1}>
                <LoadingOverlay visible={isLoading} text={loadingOverlayMessage} textColor={isDarkMode ? '$textPrimary' : '$white'} />
                <CustomHeader headerTransparent={true} headerShadowVisible={false} headerLeft={<BackButton />} headerLeftStyle={{ paddingLeft: 10 }} />
                <SignatureCanvas
                    ref={signatureScreenRef}
                    onOK={handleSignatureCompleted}
                    backgroundColor={'white'}
                    style={{ backgroundColor: 'white', flex: 1, width: '100%', height: '100%' }}
                    webStyle={signatureWebStyle}
                />
            </YStack>
        );
    }

    return <YStack flex={1}></YStack>;
};

export default ProofOfDeliveryScreen;
