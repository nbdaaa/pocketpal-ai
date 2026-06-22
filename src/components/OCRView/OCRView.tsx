import React, {useContext, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import {observer} from 'mobx-react';
import {Text} from 'react-native-paper';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {DrawerActions, useNavigation} from '@react-navigation/native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {useCameraPermission} from 'react-native-vision-camera';

import {useTheme} from '../../hooks';
import {modelStore, chatSessionStore} from '../../store';
import {L10nContext} from '../../utils';
import {MessageType} from '../../utils/types';
import {doctagsToHtml, isDocTags} from '../../utils/doctags';
import {ScannerIcon} from '../../assets/icons';
import {HtmlPreviewBubble} from '../HtmlPreviewBubble';
import {HeaderRight} from '../HeaderRight';
import ImageView from '../ChatView/ImageView';
import {t} from '../../locales';

// Hidden prompt — identical to the serving pipeline.
const OCR_PROMPT = 'Convert this page to docling format.';

interface OCRViewProps {
  onSendPress: (message: MessageType.PartialText) => void;
  onStopPress?: () => void;
}

/**
 * Dedicated OCR screen body: no chat box. A single large upload/capture
 * button imports an image, auto-runs inference with the fixed DocTags
 * prompt, and renders the result (reusing the serving-style HTML render).
 * The original image is shown as a thumbnail; tapping it opens a full view.
 */
export const OCRView: React.FC<OCRViewProps> = observer(
  ({onSendPress, onStopPress}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const {hasPermission, requestPermission} = useCameraPermission();
    const [preview, setPreview] = useState<string | null>(null);

    const styles = createStyles(theme);

    const messages = chatSessionStore.currentSessionMessages;
    const lastAssistant = messages.find(m => m.type === 'assistant_turn') as
      | MessageType.AssistantTurn
      | undefined;
    const resultText = lastAssistant
      ? (lastAssistant.steps ?? []).map(s => s.content ?? '').join('')
      : '';
    const lastUserImg = messages.find(
      m => m.type === 'text' && (m as any).imageUris?.length > 0,
    ) as MessageType.Text | undefined;
    const originalUri = lastUserImg?.imageUris?.[0];

    const inferencing = modelStore.inferencing;
    const hasModel = !!modelStore.activeModelId;

    // Timing line, identical format to the chat AssistantTurnFooter.
    const timings: any = lastAssistant?.metadata?.timings;
    const timingParts: string[] = [];
    if (timings?.predicted_per_token_ms != null) {
      timingParts.push(
        t(l10n.components.bubble.msPerToken, {
          value: timings.predicted_per_token_ms.toFixed(),
        }),
      );
    }
    if (timings?.predicted_per_second != null) {
      timingParts.push(
        t(l10n.components.bubble.tokensPerSec, {
          value: timings.predicted_per_second.toFixed(2),
        }),
      );
    }
    if (timings?.time_to_first_token_ms != null) {
      timingParts.push(
        t(l10n.components.bubble.ttft, {value: timings.time_to_first_token_ms}),
      );
    }
    const timingStr = timingParts.join(', ');

    // Live-but-throttled render: refresh the rendered docling a few times per
    // second while streaming (a per-token WebView reload would flicker and pin
    // CPU), and snap to the full text the instant generation finishes.
    const [renderText, setRenderText] = useState('');
    const lastRenderRef = useRef(0);
    useEffect(() => {
      if (!resultText) {
        setRenderText('');
        return;
      }
      if (!inferencing) {
        setRenderText(resultText);
        return;
      }
      const now = Date.now();
      if (now - lastRenderRef.current >= 350) {
        lastRenderRef.current = now;
        setRenderText(resultText);
      }
    }, [resultText, inferencing]);

    const runOcr = async (uris: string[]) => {
      if (!uris || uris.length === 0) {
        return;
      }
      // OCR has no conversation history: every image is a fresh session, so
      // results never append to a previous scan. Reset before sending.
      await chatSessionStore.resetActiveSession();
      onSendPress({text: OCR_PROMPT, type: 'text', imageUris: [uris[0]]});
    };

    const takePhoto = async () => {
      try {
        if (!hasPermission) {
          const granted = await requestPermission();
          if (!granted) {
            Alert.alert(
              l10n.camera.permissionTitle,
              l10n.camera.permissionMessage,
            );
            return;
          }
        }
        modelStore.disableAutoRelease('ocr-camera');
        const result = await launchCamera({mediaType: 'photo', quality: 1});
        if (result.assets?.[0]?.uri) {
          runOcr([result.assets[0].uri]);
        }
      } catch (e) {
        Alert.alert(l10n.errors.cameraErrorTitle, l10n.errors.cameraErrorMessage);
      } finally {
        modelStore.enableAutoRelease('ocr-camera');
      }
    };

    const selectImage = async () => {
      try {
        modelStore.disableAutoRelease('ocr-gallery');
        const result = await launchImageLibrary({
          mediaType: 'photo',
          selectionLimit: 1,
          quality: 1,
        });
        if (result.assets?.[0]?.uri) {
          runOcr([result.assets[0].uri]);
        }
      } catch (e) {
        Alert.alert(
          l10n.errors.galleryErrorTitle,
          l10n.errors.galleryErrorMessage,
        );
      } finally {
        modelStore.enableAutoRelease('ocr-gallery');
      }
    };

    const chooseSource = () => {
      if (!hasModel) {
        Alert.alert(l10n.chat.modelNotLoaded);
        return;
      }
      Alert.alert('OCR', undefined, [
        {text: l10n.camera?.takePhoto || 'Take photo', onPress: takePhoto},
        {
          text: l10n.common?.gallery || 'Choose from library',
          onPress: selectImage,
        },
        {text: l10n.common.cancel, style: 'cancel'},
      ]);
    };

    const bigButton = (label: string) => (
      <TouchableOpacity
        onPress={chooseSource}
        disabled={!hasModel}
        style={[
          styles.bigBtn,
          {backgroundColor: hasModel ? theme.colors.primary : theme.colors.surfaceDisabled},
        ]}
        accessibilityRole="button"
        accessibilityLabel="Scan a document">
        <ScannerIcon width={22} height={22} stroke={theme.colors.onPrimary} />
        <Text style={[styles.bigBtnText, {color: theme.colors.onPrimary}]}>
          {label}
        </Text>
      </TouchableOpacity>
    );

    const busy = (
      <View style={styles.busyRow}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{color: theme.colors.onSurfaceVariant}}>
          {l10n.chat.loadingModel ? 'Đang nhận dạng…' : 'Đang nhận dạng…'}
        </Text>
        {onStopPress ? (
          <TouchableOpacity onPress={onStopPress} style={styles.stopBtn}>
            <Text style={{color: '#fff'}}>{l10n.common.cancel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );

    return (
      <View
        style={[
          styles.root,
          {paddingTop: insets.top, backgroundColor: theme.colors.background},
        ]}>
        {/* Top bar with drawer toggle */}
        <View style={styles.topbar}>
          <TouchableOpacity
            onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
            hitSlop={12}
            accessibilityLabel="Open menu">
            <Text style={[styles.menuIcon, {color: theme.colors.onBackground}]}>
              ☰
            </Text>
          </TouchableOpacity>
          <Text style={[styles.title, {color: theme.colors.onBackground}]}>
            OCR
          </Text>
          <HeaderRight />
        </View>

        {resultText ? (
          <>
            <ScrollView contentContainerStyle={styles.scrollContent}>
              {originalUri ? (
                <TouchableOpacity
                  onPress={() => setPreview(originalUri)}
                  style={styles.thumbWrap}
                  activeOpacity={0.8}>
                  <Image
                    source={{uri: originalUri}}
                    style={styles.thumb}
                    resizeMode="cover"
                  />
                  <Text
                    style={[
                      styles.thumbHint,
                      {color: theme.colors.onSurfaceVariant},
                    ]}>
                    Ảnh gốc — chạm để xem
                  </Text>
                </TouchableOpacity>
              ) : null}
              {isDocTags(renderText) ? (
                // Render docling live as the model generates (throttled).
                <HtmlPreviewBubble
                  html={doctagsToHtml(renderText)}
                  title="Docling"
                />
              ) : (
                <Text selectable style={styles.rawText}>
                  {renderText || resultText}
                </Text>
              )}
              {timingStr ? (
                <Text style={styles.timing}>{timingStr}</Text>
              ) : null}
            </ScrollView>
            <View style={[styles.bottomBar, {paddingBottom: insets.bottom + 12}]}>
              {inferencing ? busy : bigButton('Quét ảnh khác')}
            </View>
          </>
        ) : (
          <View style={styles.emptyCenter}>
            <ScannerIcon
              width={72}
              height={72}
              stroke={theme.colors.onSurfaceVariant}
            />
            <Text style={[styles.hint, {color: theme.colors.onSurfaceVariant}]}>
              {hasModel
                ? 'Tải lên hoặc chụp ảnh tài liệu để nhận dạng'
                : l10n.chat.modelNotLoaded}
            </Text>
            {inferencing ? busy : bigButton('Tải / Chụp ảnh')}
          </View>
        )}

        {/* Full-image preview with pinch-to-zoom / pan / double-tap */}
        <ImageView
          images={preview ? [{uri: preview}] : []}
          imageIndex={0}
          visible={!!preview}
          onRequestClose={() => setPreview(null)}
        />
      </View>
    );
  },
);

const createStyles = (theme: any) =>
  StyleSheet.create({
    root: {flex: 1},
    topbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      height: 52,
    },
    menuIcon: {fontSize: 24},
    title: {fontSize: 18, fontWeight: '700'},
    scrollContent: {padding: 16},
    emptyCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 16,
    },
    hint: {textAlign: 'center', fontSize: 15},
    bigBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 28,
      paddingVertical: 16,
      borderRadius: 28,
    },
    bigBtnText: {fontSize: 16, fontWeight: '700'},
    bottomBar: {alignItems: 'center', paddingTop: 12, paddingHorizontal: 16},
    busyRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
    stopBtn: {
      backgroundColor: theme.colors.error,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 18,
    },
    thumbWrap: {alignItems: 'center', marginBottom: 16},
    thumb: {width: 120, height: 160, borderRadius: 8},
    thumbHint: {marginTop: 6, fontSize: 12},
    rawText: {
      fontFamily: Platform.select({ios: 'Menlo', android: 'monospace'}),
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.onSurfaceVariant,
    },
    timing: {
      marginTop: 14,
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.9)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalImg: {width: '100%', height: '100%'},
  });