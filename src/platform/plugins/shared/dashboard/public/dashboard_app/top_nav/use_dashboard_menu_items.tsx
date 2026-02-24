/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useMemo, useState } from 'react';
import useMountedState from 'react-use/lib/useMountedState';

import { useBatchedPublishingSubjects } from '@kbn/presentation-publishing';

import useObservable from 'react-use/lib/useObservable';
import type {
  AppMenuConfig,
  AppMenuItemType,
  AppMenuPrimaryActionItem,
  AppMenuSecondaryActionItem,
} from '@kbn/core-chrome-app-menu-components';
import { useDashboardExportItems } from './share/use_dashboard_export_items';
import { getAccessControlClient } from '../../services/access_control_service';
import { UI_SETTINGS } from '../../../common/constants';
import { useDashboardApi } from '../../dashboard_api/use_dashboard_api';
import { confirmDiscardUnsavedChanges } from '../../dashboard_listing/confirm_overlays';
import { openSettingsFlyout } from '../../dashboard_renderer/settings/open_settings_flyout';
import { getDashboardBackupService } from '../../services/dashboard_backup_service';
import type { SaveDashboardReturn } from '../../dashboard_api/save_modal/types';
import { coreServices, shareService, dataService } from '../../services/kibana_services';
import { getDashboardCapabilities } from '../../utils/get_dashboard_capabilities';
import { topNavStrings } from '../_dashboard_app_strings';
import { ShowShareModal } from './share/show_share_modal';
import { useDashboardAddItems } from './add_menu/use_dashboard_add_items';
import {
  dashboardClonePanelActionStrings,
  dashboardPanelContextMenuStrings,
} from '../../dashboard_actions/_dashboard_actions_strings';

const PRETTIFY_PANEL_WIDTH = 16;
const PRETTIFY_PANEL_HEIGHT = 10;
const PRETTIFY_PANELS_PER_ROW = 3; // 48 / 16

export const useDashboardMenuItems = ({
  isLabsShown,
  setIsLabsShown,
  maybeRedirect,
  showResetChange,
}: {
  isLabsShown: boolean;
  setIsLabsShown: Dispatch<SetStateAction<boolean>>;
  maybeRedirect: (result?: SaveDashboardReturn) => void;
  showResetChange?: boolean;
}) => {
  const isMounted = useMountedState();
  const accessControlClient = getAccessControlClient();
  const appId = useObservable(coreServices.application.currentAppId$);

  const [isSaveInProgress, setIsSaveInProgress] = useState(false);

  const dashboardApi = useDashboardApi();

  const [
    dashboardTitle,
    hasOverlays,
    hasUnsavedChanges,
    lastSavedId,
    viewMode,
    accessControl,
    selectedPanelIds,
  ] = useBatchedPublishingSubjects(
    dashboardApi.title$,
    dashboardApi.hasOverlays$,
    dashboardApi.hasUnsavedChanges$,
    dashboardApi.savedObjectId$,
    dashboardApi.viewMode$,
    dashboardApi.accessControl$,
    dashboardApi.selectedPanelIds$
  );

  const disableTopNav = isSaveInProgress || hasOverlays;
  const isInEditAccessMode = accessControlClient.isInEditAccessMode(accessControl);
  const canManageAccessControl = useMemo(() => {
    const userAccessControl = accessControlClient.checkUserAccessControl({
      accessControl,
      createdBy: dashboardApi.createdBy,
      userId: dashboardApi.user?.uid,
    });
    return dashboardApi?.user?.hasGlobalAccessControlPrivilege || userAccessControl;
  }, [accessControl, accessControlClient, dashboardApi.createdBy, dashboardApi.user]);

  const isEditButtonDisabled = useMemo(() => {
    if (disableTopNav) return true;
    if (canManageAccessControl) return false;
    return !isInEditAccessMode;
  }, [disableTopNav, isInEditAccessMode, canManageAccessControl]);

  /**
   * Show the dashboard's "Confirm reset changes" modal. If confirmed:
   * (1) reset the dashboard to the last saved state, and
   * (2) if `switchToViewMode` is `true`, set the dashboard to view mode.
   */
  const [isResetting, setIsResetting] = useState(false);

  const isQuickSaveButtonDisabled = useMemo(() => {
    if (disableTopNav || isResetting) return true;
    if (dashboardApi.isAccessControlEnabled) {
      if (canManageAccessControl) return false;
      return !isInEditAccessMode;
    }
    return false;
  }, [
    canManageAccessControl,
    isInEditAccessMode,
    isResetting,
    dashboardApi.isAccessControlEnabled,
    disableTopNav,
  ]);

  const resetChanges = useCallback(
    (switchToViewMode: boolean = false) => {
      dashboardApi.clearOverlays();
      const switchModes = switchToViewMode
        ? () => {
            dashboardApi.setViewMode('view');
            getDashboardBackupService().storeViewMode('view');
          }
        : undefined;
      if (!hasUnsavedChanges) {
        switchModes?.();
        return;
      }
      confirmDiscardUnsavedChanges(async () => {
        setIsResetting(true);
        await dashboardApi.asyncResetToLastSavedState();
        if (isMounted()) {
          setIsResetting(false);
          switchModes?.();
        }
      }, viewMode);
    },
    [dashboardApi, hasUnsavedChanges, viewMode, isMounted]
  );

  /**
   * initiate interactive dashboard copy action
   */
  const dashboardInteractiveSave = useCallback(async () => {
    const result = await dashboardApi.runInteractiveSave();
    maybeRedirect(result);
    if (result && !result.error) {
      return result;
    }
  }, [maybeRedirect, dashboardApi]);

  /**
   * Save the dashboard without any UI or popups.
   */
  const quickSaveDashboard = useCallback(() => {
    setIsSaveInProgress(true);
    dashboardApi.runQuickSave().then(() =>
      setTimeout(() => {
        setIsSaveInProgress(false);
      }, 100)
    );
  }, [dashboardApi]);

  const saveFromShareModal = useCallback(async () => {
    if (lastSavedId) {
      quickSaveDashboard();
    } else {
      dashboardInteractiveSave();
    }
  }, [quickSaveDashboard, dashboardInteractiveSave, lastSavedId]);

  const addMenuItems = useDashboardAddItems({ dashboardApi });

  const exportItems = useDashboardExportItems({
    dashboardApi,
    objectId: lastSavedId,
    isDirty: Boolean(hasUnsavedChanges),
    dashboardTitle,
  });

  /**
   * Show the Dashboard app's share menu
   */
  const showShare = useCallback(() => {
    ShowShareModal({
      dashboardTitle,
      savedObjectId: lastSavedId,
      isDirty: Boolean(hasUnsavedChanges),
      canSave: (canManageAccessControl || isInEditAccessMode) && Boolean(hasUnsavedChanges),
      accessControl,
      createdBy: dashboardApi.createdBy,
      isManaged: dashboardApi.isManaged,
      accessControlClient,
      saveDashboard: saveFromShareModal,
      changeAccessMode: dashboardApi.changeAccessMode,
    });
  }, [
    dashboardTitle,
    hasUnsavedChanges,
    lastSavedId,
    isInEditAccessMode,
    canManageAccessControl,
    accessControl,
    saveFromShareModal,
    dashboardApi.changeAccessMode,
    dashboardApi.createdBy,
    accessControlClient,
    dashboardApi.isManaged,
  ]);

  const getEditTooltip = useCallback(() => {
    if (dashboardApi.isManaged) {
      return topNavStrings.edit.managedDashboardTooltip;
    }
    if (isInEditAccessMode || canManageAccessControl) {
      return undefined;
    }
    return topNavStrings.edit.writeRestrictedTooltip;
  }, [isInEditAccessMode, canManageAccessControl, dashboardApi.isManaged]);

  const getShareTooltip = useCallback(() => {
    if (!dashboardApi.isAccessControlEnabled) return undefined;
    return isInEditAccessMode
      ? topNavStrings.share.editModeTooltipContent
      : topNavStrings.share.writeRestrictedModeTooltipContent;
  }, [isInEditAccessMode, dashboardApi.isAccessControlEnabled]);

  const resetChangesMenuItem = useMemo(() => {
    return {
      order: viewMode === 'edit' ? 2 : 4,
      label: topNavStrings.resetChanges.label,
      id: 'reset',
      testId: 'dashboardDiscardChangesMenuItem',
      iconType: 'editorUndo',
      disableButton:
        isResetting ||
        !hasUnsavedChanges ||
        hasOverlays ||
        (viewMode === 'edit' && (isSaveInProgress || !lastSavedId)) ||
        !lastSavedId, // Disable when on a new dashboard
      isLoading: isResetting,
      run: () => resetChanges(),
    };
  }, [
    hasOverlays,
    lastSavedId,
    resetChanges,
    viewMode,
    isSaveInProgress,
    hasUnsavedChanges,
    isResetting,
  ]);

  const prettifyDashboard = useCallback(() => {
    const layout = dashboardApi.layout$.getValue();
    const panelIds = Object.keys(layout.panels).sort((a, b) => {
      const ga = layout.panels[a].grid;
      const gb = layout.panels[b].grid;
      const ya = ga.y ?? 0;
      const yb = gb.y ?? 0;
      if (ya !== yb) return ya - yb;
      return (ga.x ?? 0) - (gb.x ?? 0);
    });
    const newPanels = { ...layout.panels };
    panelIds.forEach((id, index) => {
      const col = index % PRETTIFY_PANELS_PER_ROW;
      const row = Math.floor(index / PRETTIFY_PANELS_PER_ROW);
      newPanels[id] = {
        ...layout.panels[id],
        grid: {
          x: col * PRETTIFY_PANEL_WIDTH,
          y: row * PRETTIFY_PANEL_HEIGHT,
          w: PRETTIFY_PANEL_WIDTH,
          h: PRETTIFY_PANEL_HEIGHT,
        },
      };
    });
    dashboardApi.layout$.next({ ...layout, panels: newPanels });
  }, [dashboardApi]);

  /**
   * Register all of the top nav configs that can be used by dashboard.
   */

  const menuItems = useMemo(() => {
    return {
      // Regular menu items
      fullScreen: {
        order: 1,
        label: topNavStrings.fullScreen.label,
        id: 'full-screen',
        testId: 'dashboardFullScreenMode',
        iconType: 'fullScreen',
        run: () => dashboardApi.setFullScreenMode(true),
        disableButton: disableTopNav,
      } as AppMenuItemType,

      duplicate: {
        order: 2,
        disableButton: disableTopNav,
        id: 'interactive-save',
        testId: 'dashboardInteractiveSaveMenuItem',
        iconType: 'copy',
        run: dashboardInteractiveSave,
        label: topNavStrings.viewModeInteractiveSave.label,
      } as AppMenuItemType,

      switchToViewMode: {
        order: 1,
        iconType: 'exit', // use 'logOut' when added to EUI
        label: topNavStrings.switchToViewMode.label,
        id: 'cancel',
        disableButton: disableTopNav || !lastSavedId || isResetting,
        isLoading: isResetting,
        testId: 'dashboardViewOnlyMode',
        run: () => resetChanges(true),
      } as AppMenuItemType,

      backgroundSearch: {
        order: 6,
        label: topNavStrings.backgroundSearch.label,
        id: 'backgroundSearch',
        iconType: 'backgroundTask',
        testId: 'openBackgroundSearchFlyoutButton',
        run: () =>
          dataService.search.showSearchSessionsFlyout({
            appId: appId!,
            trackingProps: { openedFrom: 'background search button' },
          }),
      } as AppMenuItemType,

      prettifyDashboard: {
        order: 8,
        label: topNavStrings.prettifyDashboard.label,
        id: 'prettifyDashboard',
        iconType: 'grid',
        testId: 'dashboardPrettifyDashboard',
        disableButton: disableTopNav,
        run: prettifyDashboard,
      } as AppMenuItemType,

      duplicateSelectedPanels: {
        order: 9,
        label: dashboardClonePanelActionStrings.getDisplayName(),
        id: 'duplicateSelectedPanels',
        iconType: 'copy',
        testId: 'dashboardDuplicateSelectedPanels',
        disableButton: disableTopNav || (selectedPanelIds ?? new Set()).size === 0,
        run: async () => {
          const ids = Array.from(selectedPanelIds ?? new Set<string>());
          for (const id of ids) {
            try {
              await dashboardApi.duplicatePanel(id);
            } catch {
              // skip if panel no longer exists
            }
          }
        },
      } as AppMenuItemType,

      removeSelectedPanels: {
        order: 10,
        label: dashboardPanelContextMenuStrings.getRemoveLabel(),
        id: 'removeSelectedPanels',
        iconType: 'trash',
        testId: 'dashboardRemoveSelectedPanels',
        disableButton: disableTopNav || (selectedPanelIds ?? new Set()).size === 0,
        run: () => {
          const ids = selectedPanelIds ?? new Set<string>();
          ids.forEach((id) => {
            try {
              dashboardApi.removePanel(id);
            } catch {
              // skip
            }
          });
          const nextSelected = new Set(ids);
          ids.forEach((id) => nextSelected.delete(id));
          dashboardApi.setSelectedPanelIds(nextSelected);
        },
      } as AppMenuItemType,

      groupSelectedPanels: {
        order: 11,
        label: dashboardPanelContextMenuStrings.getGroupLabel(),
        id: 'groupSelectedPanels',
        iconType: 'folderClosed',
        testId: 'dashboardGroupSelectedPanels',
        disableButton:
          disableTopNav || (selectedPanelIds ?? new Set()).size < 2,
        run: () => {
          const ids = selectedPanelIds ?? new Set<string>();
          if (ids.size < 2) return;
          dashboardApi.movePanelsToNewSection(Array.from(ids));
        },
      } as AppMenuItemType,

      share: {
        order: 4,
        label: topNavStrings.share.label,
        tooltipContent: getShareTooltip(),
        tooltipTitle: topNavStrings.share.tooltipTitle,
        id: 'share',
        iconType: 'share',
        testId: 'shareTopNavButton',
        disableButton: disableTopNav,
        run: () => showShare(),
      } as AppMenuItemType,

      export: {
        order: 3,
        label: topNavStrings.export.label,
        id: 'export',
        iconType: 'exportAction',
        testId: 'exportTopNavButton',
        disableButton: disableTopNav,
        items: exportItems,
        popoverWidth: 160,
        popoverTestId: 'exportPopoverPanel',
      } as AppMenuItemType,

      settings: {
        order: 5,
        iconType: 'gear',
        label: topNavStrings.settings.label,
        id: 'settings',
        testId: 'dashboardSettingsButton',
        disableButton: disableTopNav,
        htmlId: 'dashboardSettingsButton',
        run: () => openSettingsFlyout(dashboardApi),
      } as AppMenuItemType,

      // Action items
      add: {
        label: topNavStrings.add.label,
        id: 'add',
        iconType: 'plusInCircle',
        color: 'success',
        testId: 'dashboardAddTopNavButton',
        htmlId: 'dashboardAddTopNavButton',
        disableButton: disableTopNav,
        minWidth: false,
        popoverWidth: 200,
        items: addMenuItems,
      } as AppMenuSecondaryActionItem,

      edit: {
        label: topNavStrings.edit.label,
        id: 'edit',
        iconType: 'pencil',
        testId: 'dashboardEditMode',
        hidden: ['s', 'xs'], // hide for small screens - editing doesn't work in mobile mode.
        run: () => {
          getDashboardBackupService().storeViewMode('edit');
          dashboardApi.setViewMode('edit');
          dashboardApi.clearOverlays();
        },
        disableButton: isEditButtonDisabled,
        tooltipContent: getEditTooltip(),
        color: 'text',
      } as AppMenuPrimaryActionItem,

      save: {
        label: topNavStrings.quickSave.label,
        id: 'save',
        iconType: 'save',
        testId: lastSavedId ? 'dashboardQuickSaveMenuItem' : 'dashboardInteractiveSaveMenuItem',
        disableButton: lastSavedId ? isQuickSaveButtonDisabled : disableTopNav, // Only check disableTopNav for new dashboards
        run: () => (lastSavedId ? quickSaveDashboard() : dashboardInteractiveSave()),
        popoverWidth: 150,
        splitButtonProps: {
          items: [
            {
              id: 'save-as',
              label: topNavStrings.editModeInteractiveSave.label,
              iconType: 'save',
              order: 1,
              testId: 'dashboardInteractiveSaveMenuItem',
              disableButton: isSaveInProgress || !lastSavedId, // Disable when on a new dashboard
              run: () => dashboardInteractiveSave(),
            },
            resetChangesMenuItem,
          ],
          isMainButtonLoading: isSaveInProgress,
          secondaryButtonAriaLabel: topNavStrings.saveMenu.label,
          secondaryButtonIcon: 'arrowDown',
          secondaryButtonFill: true,
          isSecondaryButtonDisabled: isSaveInProgress,
          notifcationIndicatorTooltipContent: topNavStrings.unsavedChangesTooltip,
          showNotificationIndicator: hasUnsavedChanges,
        },
      } as AppMenuPrimaryActionItem,

      // Labs item
      labs: {
        order: 7,
        label: topNavStrings.labs.label,
        id: 'labs',
        testId: 'dashboardLabs',
        run: () => setIsLabsShown(!isLabsShown),
      } as AppMenuItemType,
    };
  }, [
    disableTopNav,
    isSaveInProgress,
    lastSavedId,
    dashboardInteractiveSave,
    showShare,
    dashboardApi,
    setIsLabsShown,
    isLabsShown,
    quickSaveDashboard,
    resetChanges,
    isResetting,
    isEditButtonDisabled,
    getEditTooltip,
    getShareTooltip,
    appId,
    isQuickSaveButtonDisabled,
    hasUnsavedChanges,
    addMenuItems,
    resetChangesMenuItem,
    exportItems,
    prettifyDashboard,
    selectedPanelIds,
  ]);

  /**
   * Build ordered menus for view and edit mode.
   */
  const isLabsEnabled = useMemo(() => coreServices.uiSettings.get(UI_SETTINGS.ENABLE_LABS_UI), []);

  const hasExportIntegration = useMemo(() => {
    if (!shareService) return false;
    return shareService.availableIntegrations('dashboard', 'export').length > 0;
  }, []);

  const viewModeTopNavConfig = useMemo(() => {
    const { showWriteControls, storeSearchSession } = getDashboardCapabilities();

    const items: AppMenuItemType[] = [menuItems.fullScreen];

    if (showWriteControls) {
      items.push(menuItems.duplicate);
    }

    // Only show the export button if the current user meets the requirements for at least one registered export integration
    if (shareService && hasExportIntegration) {
      items.push(menuItems.export);
    }

    if (shareService) {
      items.push(menuItems.share);
    }

    if (showResetChange) {
      items.push(resetChangesMenuItem);
    }

    if (storeSearchSession && dataService.search.isBackgroundSearchEnabled) {
      items.push(menuItems.backgroundSearch);
    }

    if (isLabsEnabled) {
      items.push(menuItems.labs);
    }

    const viewModeConfig: AppMenuConfig = {
      items,
    };

    if (showWriteControls && !dashboardApi.isManaged) {
      viewModeConfig.primaryActionItem = menuItems.edit;
    }

    return viewModeConfig;
  }, [
    menuItems.fullScreen,
    menuItems.duplicate,
    menuItems.export,
    menuItems.share,
    menuItems.edit,
    menuItems.backgroundSearch,
    menuItems.labs,
    resetChangesMenuItem,
    hasExportIntegration,
    dashboardApi.isManaged,
    showResetChange,
    isLabsEnabled,
  ]);

  const editModeTopNavConfig = useMemo(() => {
    const { storeSearchSession } = getDashboardCapabilities();

    const items: AppMenuItemType[] = [menuItems.switchToViewMode, menuItems.settings];

    // Only show the export button if the current user meets the requirements for at least one registered export integration
    if (shareService && hasExportIntegration) {
      items.push(menuItems.export);
    }

    if (shareService) {
      items.push(menuItems.share);
    }

    if (storeSearchSession && dataService.search.isBackgroundSearchEnabled) {
      items.push(menuItems.backgroundSearch);
    }

    items.push(menuItems.prettifyDashboard);
    items.push(menuItems.duplicateSelectedPanels);
    items.push(menuItems.removeSelectedPanels);
    items.push(menuItems.groupSelectedPanels);

    if (isLabsEnabled) {
      items.push(menuItems.labs);
    }

    const editModeConfig: AppMenuConfig = {
      items,
      secondaryActionItem: menuItems.add,
      primaryActionItem: menuItems.save,
    };

    return editModeConfig;
  }, [
    menuItems.switchToViewMode,
    menuItems.export,
    menuItems.share,
    menuItems.settings,
    menuItems.backgroundSearch,
    menuItems.prettifyDashboard,
    menuItems.duplicateSelectedPanels,
    menuItems.removeSelectedPanels,
    menuItems.groupSelectedPanels,
    menuItems.add,
    menuItems.save,
    menuItems.labs,
    hasExportIntegration,
    isLabsEnabled,
  ]);

  return { viewModeTopNavConfig, editModeTopNavConfig };
};
