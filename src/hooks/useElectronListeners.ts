import { useState, useEffect } from 'react';
import { useNotificationStore } from '../store/useNotificationStore';
import { bridge } from '../bridge';

export type ToolView = null | 'search' | 'keywords';

/**
 * Registers Electron IPC menu listeners and exposes the modal/view state they control.
 *
 * Handles: Settings, Import folder, Notifications.
 */
export function useElectronListeners() {
  const addNotification = useNotificationStore(state => state.addNotification);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [toolView, setToolView] = useState<ToolView>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFolderPath, setImportFolderPath] = useState('');
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncSourcePath, setSyncSourcePath] = useState('');
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupTargetPath, setBackupTargetPath] = useState('');

  useEffect(() => {
    const cleanupSettings = bridge.onOpenSettings(() => {
      setIsSettingsOpen(true);
    });

    const cleanupDiagnostics = bridge.onOpenDiagnostics(() => {
      setIsDiagnosticsOpen(true);
    });

    const cleanupSearch = bridge.onOpenSearch(() => {
      setToolView('search');
    });

    const cleanupKeywords = bridge.onOpenKeywords(() => {
      setToolView('keywords');
    });

    const cleanupImport = bridge.onImportFolderSelected((path) => {
      setImportFolderPath(path);
      setIsImportModalOpen(true);
    });

    const cleanupSync = bridge.onSyncSourceSelected((path) => {
      setSyncSourcePath(path);
      setIsSyncModalOpen(true);
    });

    const cleanupBackup = bridge.onBackupTargetSelected((path) => {
      setBackupTargetPath(path);
      setIsBackupModalOpen(true);
    });

    const cleanupNotification = bridge.onShowNotification((data) => {
      addNotification(data.message, data.type);
    });

    return () => {
      cleanupSettings();
      cleanupDiagnostics();
      cleanupSearch();
      cleanupKeywords();
      cleanupImport();
      cleanupSync();
      cleanupBackup();
      cleanupNotification();
    };
  }, [addNotification]);

  const isSearchOpen = toolView === 'search';
  const isKeywordsOpen = toolView === 'keywords';
  const isToolViewOpen = toolView !== null;

  const setIsSearchOpen = (open: boolean) => {
    setToolView(open ? 'search' : null);
  };

  return {
    isSettingsOpen,
    setIsSettingsOpen,
    isDiagnosticsOpen,
    setIsDiagnosticsOpen,
    toolView,
    setToolView,
    isSearchOpen,
    setIsSearchOpen,
    isKeywordsOpen,
    isToolViewOpen,
    isImportModalOpen,
    setIsImportModalOpen,
    importFolderPath,
    setImportFolderPath,
    isSyncModalOpen,
    setIsSyncModalOpen,
    syncSourcePath,
    setSyncSourcePath,
    isBackupModalOpen,
    setIsBackupModalOpen,
    backupTargetPath,
    setBackupTargetPath,
  };
}
