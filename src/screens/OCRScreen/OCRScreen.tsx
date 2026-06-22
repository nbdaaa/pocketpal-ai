import React, {useRef} from 'react';

import {observer} from 'mobx-react';

import {OCRView} from '../../components/OCRView';
import {useChatSession} from '../../hooks';
import {user, assistant} from '../../utils/chat';

/**
 * Dedicated OCR screen. Reuses the same inference pipeline as the chat
 * (useChatSession → handleSendPress) but presents a stripped-down
 * upload/capture UI (OCRView) instead of a chat box.
 */
export const OCRScreen: React.FC = observer(() => {
  const currentMessageInfo = useRef<{
    createdAt: number;
    id: string;
    sessionId: string;
  } | null>(null);

  const {handleSendPress, handleStopPress} = useChatSession(
    currentMessageInfo,
    user,
    assistant,
  );

  return (
    <OCRView onSendPress={handleSendPress} onStopPress={handleStopPress} />
  );
});