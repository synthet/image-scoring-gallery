import { useState, useEffect } from 'react';
import { useNotificationStore } from '../store/useNotificationStore';

/**
 * Registers Electron IPC menu listeners and exposes the modal/view state they control.
 *
 * Handles: Settings, Duplicates view, Processing view, Import folder, Notifications.
 */
export function useElectronListeners() {
  const addNotification = useNotificationStore(state => state.addNotification);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFolderPath, setImportFolderPath] = useState('');
  const [currentView, setCurrentView] = useState<'gallery' | 'duplicates' | 'processing'>('gallery');

  useEffect(() => {
    let cleanupSettings: (() => void) | undefined;
    if (window.electron?.onOpenSettings) {
      cleanupSettings = window.electron.onOpenSettings(() => {
        setIsSettingsOpen(true);
      });
    }

    let cleanupDuplicates: (() => void) | undefined;
    if (window.electron?.onOpenDuplicates) {
      cleanupDuplicates = window.electron.onOpenDuplicates(() => {
        setCurrentView('duplicates');
      });
    }

    let cleanupProcessing: (() => void) | undefined;
    if (window.electron?.onOpenProcessing) {
      cleanupProcessing = window.electron.onOpenProcessing(() => {
        setCurrentView('processing');
      });
    }

    let cleanupImport: (() => void) | undefined;
    if (window.electron?.onImportFolderSelected) {
      cleanupImport = window.electron.onImportFolderSelected((path) => {
        setImportFolderPath(path);
        setIsImportModalOpen(true);
      });
    }

    let cleanupNotification: (() => void) | undefined;
    if (window.electron?.onShowNotification) {
      cleanupNotification = window.electron.onShowNotification((data) => {
        addNotification(data.message, data.type);
      });
    }

    return () => {
      if (cleanupSettings) cleanupSettings();
      if (cleanupDuplicates) cleanupDuplicates();
      if (cleanupProcessing) cleanupProcessing();
      if (cleanupImport) cleanupImport();
      if (cleanupNotification) cleanupNotification();
    };
  }, [addNotification]);

  return {
    isSettingsOpen,
    setIsSettingsOpen,
    isImportModalOpen,
    setIsImportModalOpen,
    importFolderPath,
    setImportFolderPath,
    currentView,
    setCurrentView,
  };
}
