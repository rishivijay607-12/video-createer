/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, {useCallback, useState, useEffect} from 'react';
import ApiKeyDialog from './components/ApiKeyDialog';
import {CurvedArrowDownIcon} from './components/icons';
import LoadingIndicator from './components/LoadingIndicator';
import PromptForm from './components/PromptForm';
import VideoResult from './components/VideoResult';
import {generateVideo} from './services/geminiService';
import {AppState, GenerateVideoParams} from './types';

// Type definition for aistudio object if not globally available
// FIX: The error "Subsequent property declarations must have the same type" indicates
// that a global type `AIStudio` is expected for `window.aistudio`. Defining and using
// a named interface resolves this conflict.
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastConfig, setLastConfig] = useState<GenerateVideoParams | null>(
    null,
  );
  const [lastVideoBlob, setLastVideoBlob] = useState<Blob | null>(null);
  const [isApiKeySelected, setIsApiKeySelected] = useState(false);

  // A single state to hold the initial values for the prompt form
  const [initialFormValues, setInitialFormValues] =
    useState<GenerateVideoParams | null>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setIsApiKeySelected(hasKey);
      } else {
        // If aistudio is not available, we assume the API key is set in the environment.
        // The generateVideo call will fail with a clear message if it's not.
        setIsApiKeySelected(true);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectKey = useCallback(async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      // Assume success and update state to unblock UI, per guidelines
      setIsApiKeySelected(true);
    }
  }, []);

  const handleGenerate = useCallback(
    async (params: GenerateVideoParams) => {
      if (!isApiKeySelected) {
        setErrorMessage('Please select an API key before generating a video.');
        setAppState(AppState.ERROR);
        return;
      }

      setAppState(AppState.LOADING);
      setErrorMessage(null);
      setLastConfig(params);
      // Reset initial form values for the next fresh start
      setInitialFormValues(null);

      try {
        const {url, blob} = await generateVideo(params);
        setVideoUrl(url);
        setLastVideoBlob(blob);
        setAppState(AppState.SUCCESS);
      } catch (error) {
        console.error('Video generation failed:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'An unknown error occurred.';

        let userFriendlyMessage = `Video generation failed: ${errorMessage}`;

        const isApiKeyError = (message: string) => {
          return (
            message.includes('API_KEY') ||
            message.includes('API key') ||
            message.toLowerCase().includes('permission denied') ||
            message.includes('Requested entity was not found.')
          );
        };

        if (typeof errorMessage === 'string' && isApiKeyError(errorMessage)) {
          if (window.aistudio) {
            userFriendlyMessage =
              'There was an issue with your API key. It might be invalid, lack permissions, or billing may not be enabled. Please select a valid key and try again.';
            setIsApiKeySelected(false); // Re-prompt for key selection
          } else {
            userFriendlyMessage =
              'Your API_KEY environment variable appears to be invalid or missing permissions. Please check it and ensure billing is enabled for your project.';
          }
        }

        setErrorMessage(userFriendlyMessage);
        setAppState(AppState.ERROR);
      }
    },
    [isApiKeySelected],
  );

  const handleRetry = useCallback(() => {
    if (lastConfig) {
      handleGenerate(lastConfig);
    }
  }, [lastConfig, handleGenerate]);

  const handleNewVideo = useCallback(() => {
    setAppState(AppState.IDLE);
    setVideoUrl(null);
    setErrorMessage(null);
    setLastConfig(null);
    setLastVideoBlob(null);
    setInitialFormValues(null); // Clear the form state
  }, []);

  const handleTryAgainFromError = useCallback(() => {
    if (lastConfig) {
      setInitialFormValues(lastConfig);
      setAppState(AppState.IDLE);
      setErrorMessage(null);
    } else {
      // Fallback to a fresh start if there's no last config
      handleNewVideo();
    }
  }, [lastConfig, handleNewVideo]);

  /* const handleExtend = useCallback(async () => {
    if (lastConfig && lastVideoBlob) {
      try {
        const base64 = await blobToBase64(lastVideoBlob);
        const file = new File([lastVideoBlob], 'last_video.mp4', {
          type: lastVideoBlob.type,
        });
        const videoFile: VideoFile = {file, base64};

        setInitialInputVideo(videoFile);
        setInitialMode(GenerationMode.EXTEND_VIDEO);
        setInitialPrompt(
          `Continuing the story from: "${lastConfig.prompt}"\n\n`,
        );

        setAppState(AppState.IDLE);
        setVideoUrl(null);
        setErrorMessage(null);
      } catch (error) {
        console.error('Failed to process video for extension:', error);
        const message =
          error instanceof Error ? error.message : 'An unknown error occurred.';
        setErrorMessage(`Failed to prepare video for extension: ${message}`);
        setAppState(AppState.ERROR);
      }
    }
  }, [lastConfig, lastVideoBlob]); */

  const renderError = (message: string) => (
    <div className="text-center bg-red-900/20 border border-red-500 p-8 rounded-lg">
      <h2 className="text-2xl font-bold text-red-400 mb-4">Error</h2>
      <p className="text-red-300">{message}</p>
      <button
        onClick={handleTryAgainFromError}
        className="mt-6 px-6 py-2 bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
        Try Again
      </button>
    </div>
  );

  if (!isApiKeySelected) {
    return <ApiKeyDialog onContinue={handleSelectKey} />;
  }

  return (
    <div className="h-screen bg-black text-gray-200 flex flex-col font-sans overflow-hidden">
      <header className="py-6 flex justify-center items-center px-8 relative z-10">
        <h1 className="text-5xl font-semibold tracking-wide text-center bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
          Veo Studio
        </h1>
      </header>
      <main className="w-full max-w-4xl mx-auto flex-grow flex flex-col p-4">
        {appState === AppState.IDLE ? (
          <>
            <div className="flex-grow flex items-center justify-center">
              <div className="relative text-center">
                <h2 className="text-3xl text-gray-600">
                  Type in the prompt box to start
                </h2>
                <CurvedArrowDownIcon className="absolute top-full left-1/2 -translate-x-1/2 mt-4 w-24 h-24 text-gray-700 opacity-60" />
              </div>
            </div>
            <div className="pb-4">
              <PromptForm
                onGenerate={handleGenerate}
                initialValues={initialFormValues}
              />
            </div>
          </>
        ) : (
          <div className="flex-grow flex items-center justify-center">
            {appState === AppState.LOADING && <LoadingIndicator />}
            {appState === AppState.SUCCESS && videoUrl && (
              <VideoResult
                videoUrl={videoUrl}
                onRetry={handleRetry}
                onNewVideo={handleNewVideo}
                // onExtend={handleExtend}
              />
            )}
            {appState === AppState.SUCCESS &&
              !videoUrl &&
              renderError(
                'Video generated, but URL is missing. Please try again.',
              )}
            {appState === AppState.ERROR &&
              errorMessage &&
              renderError(errorMessage)}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
