import { useState, useEffect } from 'react';
import { useNotificationStore } from '../store/useNotificationStore';
import { bridge } from '../bridge';

/**
 * Registers Electron IPC menu listeners and exposes the modal/view state they control.
 *
 * Handles: Settings, Duplicates view, Processing view, Import folder, Notifications.
 */
export function useElectronListeners() {
  const addNotification = useNotificationStore(state => state.addNotification);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFolderPath, setImportFolderPath] = useState('');
  const [currentView, setCurrentView] = useState<'gallery' | 'duplicates' | 'runs'>('gallery');

  useEffect(() => {
    const cleanupSettings = bridge.onOpenSettings(() => {
      setIsSettingsOpen(true);
    });

    const cleanupDiagnostics = bridge.onOpenDiagnostics(() => {
      setIsDiagnosticsOpen(true);
    });

    const cleanupDuplicates = bridge.onOpenDuplicates(() => {
      setCurrentView('duplicates');
    });

    const cleanupRuns = bridge.onOpenRuns(() => {
      setCurrentView('runs');
    });

    const cleanupImport = bridge.onImportFolderSelected((path) => {
      setImportFolderPath(path);
      setIsImportModalOpen(true);
    });

    const cleanupNotification = bridge.onShowNotification((data) => {
      addNotification(data.message, data.type);
    });

    return () => {
      cleanupSettings();
      cleanupDiagnostics();
      cleanupDuplicates();
      cleanupRuns();
      cleanupImport();
      cleanupNotification();
    };
  }, [addNotification]);

  return {
    isSettingsOpen,
    setIsSettingsOpen,
    isDiagnosticsOpen,
    setIsDiagnosticsOpen,
    isImportModalOpen,
    setIsImportModalOpen,
    importFolderPath,
    setImportFolderPath,
    currentView,
    setCurrentView,
  };
}
