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
  const [currentView, setCurrentView] = useState<'gallery' | 'duplicates' | 'runs'>('gallery');

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

    let cleanupRuns: (() => void) | undefined;
    if (window.electron?.onOpenRuns) {
      cleanupRuns = window.electron.onOpenRuns(() => {
        setCurrentView('runs');
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
      if (cleanupRuns) cleanupRuns();
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
