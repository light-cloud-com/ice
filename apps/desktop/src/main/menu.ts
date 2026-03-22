/**
 * Application Menu
 *
 * Defines the native menu bar for Light Cloud desktop application.
 */

import { Menu, app, BrowserWindow, shell } from 'electron';

export function create_application_menu(): void {
  const is_mac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // App Menu (macOS only)
    ...(is_mac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Preferences...',
                accelerator: 'Cmd+,',
                click: () => send_to_renderer('menu:preferences'),
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),

    // File Menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => send_to_renderer('menu:newGraph'),
        },
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: () => send_to_renderer('menu:openGraph'),
        },
        {
          label: 'Open Recent',
          role: 'recentDocuments' as any,
          submenu: [
            {
              label: 'Clear Recent',
              role: 'clearRecentDocuments' as any,
            },
          ],
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => send_to_renderer('menu:saveGraph'),
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => send_to_renderer('menu:saveGraphAs'),
        },
        { type: 'separator' },
        {
          label: 'Import',
          submenu: [
            {
              label: 'From AWS Account...',
              click: () => send_to_renderer('menu:importAws'),
            },
            {
              label: 'From Google Cloud...',
              click: () => send_to_renderer('menu:importGcp'),
            },
            {
              label: 'From Azure...',
              click: () => send_to_renderer('menu:importAzure'),
            },
            { type: 'separator' },
            {
              label: 'From Terraform State...',
              click: () => send_to_renderer('menu:importTerraform'),
            },
            {
              label: 'From Pulumi State...',
              click: () => send_to_renderer('menu:importPulumi'),
            },
            { type: 'separator' },
            {
              label: 'From Kubernetes Cluster...',
              click: () => send_to_renderer('menu:importKubernetes'),
            },
          ],
        },
        {
          label: 'Export',
          submenu: [
            {
              label: 'As Light Cloud Format...',
              click: () => send_to_renderer('menu:exportJson'),
            },
            { type: 'separator' },
            {
              label: 'As Terraform...',
              click: () => send_to_renderer('menu:exportTerraform'),
            },
            {
              label: 'As Pulumi...',
              click: () => send_to_renderer('menu:exportPulumi'),
            },
            {
              label: 'As CloudFormation...',
              click: () => send_to_renderer('menu:exportCloudFormation'),
            },
            { type: 'separator' },
            {
              label: 'As Diagram (PNG)...',
              click: () => send_to_renderer('menu:exportPng'),
            },
            {
              label: 'As Diagram (SVG)...',
              click: () => send_to_renderer('menu:exportSvg'),
            },
          ],
        },
        { type: 'separator' },
        is_mac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    // Edit Menu
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => send_to_renderer('menu:undo'),
        },
        {
          label: 'Redo',
          accelerator: is_mac ? 'Cmd+Shift+Z' : 'Ctrl+Y',
          click: () => send_to_renderer('menu:redo'),
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        {
          label: 'Duplicate',
          accelerator: 'CmdOrCtrl+D',
          click: () => send_to_renderer('menu:duplicate'),
        },
        { type: 'separator' },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          click: () => send_to_renderer('menu:selectAll'),
        },
        {
          label: 'Deselect All',
          accelerator: 'Escape',
          click: () => send_to_renderer('menu:deselectAll'),
        },
        { type: 'separator' },
        {
          label: 'Delete',
          accelerator: 'Backspace',
          click: () => send_to_renderer('menu:deleteSelected'),
        },
      ],
    },

    // View Menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => send_to_renderer('menu:zoomIn'),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => send_to_renderer('menu:zoomOut'),
        },
        {
          label: 'Zoom to Fit',
          accelerator: 'CmdOrCtrl+0',
          click: () => send_to_renderer('menu:fitToScreen'),
        },
        {
          label: 'Zoom to 100%',
          accelerator: 'CmdOrCtrl+1',
          click: () => send_to_renderer('menu:zoomReset'),
        },
        { type: 'separator' },
        {
          label: 'Show Resources Panel',
          accelerator: 'CmdOrCtrl+1',
          click: () => send_to_renderer('menu:togglePalette'),
        },
        {
          label: 'Show Properties Panel',
          accelerator: 'CmdOrCtrl+I',
          click: () => send_to_renderer('menu:toggleProperties'),
        },
        {
          label: 'Show Minimap',
          accelerator: 'CmdOrCtrl+M',
          click: () => send_to_renderer('menu:toggleMinimap'),
        },
        { type: 'separator' },
        {
          label: 'View Level',
          submenu: [
            {
              label: 'Level 1 - Blocks',
              accelerator: 'CmdOrCtrl+Shift+1',
              click: () => send_to_renderer('menu:viewLevel', 1),
            },
            {
              label: 'Level 2 - Services',
              accelerator: 'CmdOrCtrl+Shift+2',
              click: () => send_to_renderer('menu:viewLevel', 2),
            },
            {
              label: 'Level 3 - Resources',
              accelerator: 'CmdOrCtrl+Shift+3',
              click: () => send_to_renderer('menu:viewLevel', 3),
            },
          ],
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
      ],
    },

    // Infrastructure Menu
    {
      label: 'Infrastructure',
      submenu: [
        {
          label: 'Add Block...',
          accelerator: 'CmdOrCtrl+B',
          click: () => send_to_renderer('menu:addBlock'),
        },
        {
          label: 'Add Resource...',
          accelerator: 'CmdOrCtrl+R',
          click: () => send_to_renderer('menu:addResource'),
        },
        { type: 'separator' },
        {
          label: 'Group Selected',
          accelerator: 'CmdOrCtrl+G',
          click: () => send_to_renderer('menu:groupSelected'),
        },
        {
          label: 'Ungroup',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => send_to_renderer('menu:ungroupSelected'),
        },
        { type: 'separator' },
        {
          label: 'Auto-Organize Layout',
          accelerator: 'CmdOrCtrl+L',
          click: () => send_to_renderer('menu:autoLayout'),
        },
        { type: 'separator' },
        {
          label: 'Validate Configuration',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => send_to_renderer('menu:validate'),
        },
        {
          label: 'Check Security Rules',
          click: () => send_to_renderer('menu:checkSecurity'),
        },
        {
          label: 'Estimate Costs',
          click: () => send_to_renderer('menu:estimateCosts'),
        },
      ],
    },

    // Cloud Menu
    {
      label: 'Cloud',
      submenu: [
        {
          label: 'Connect AWS Account...',
          click: () => send_to_renderer('menu:connectAws'),
        },
        {
          label: 'Connect Google Cloud...',
          click: () => send_to_renderer('menu:connectGcp'),
        },
        {
          label: 'Connect Azure...',
          click: () => send_to_renderer('menu:connectAzure'),
        },
        { type: 'separator' },
        {
          label: 'Manage Connections...',
          click: () => send_to_renderer('menu:manageConnections'),
        },
        { type: 'separator' },
        {
          label: 'Sync with Cloud',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => send_to_renderer('menu:syncCloud'),
        },
        {
          label: 'Detect Drift',
          click: () => send_to_renderer('menu:detectDrift'),
        },
      ],
    },

    // Deploy Menu
    {
      label: 'Deploy',
      submenu: [
        {
          label: 'Preview Changes...',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => send_to_renderer('menu:plan'),
        },
        {
          label: 'Deploy to Cloud...',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => send_to_renderer('menu:apply'),
        },
        { type: 'separator' },
        {
          label: 'Deployment History',
          click: () => send_to_renderer('menu:deploymentHistory'),
        },
        {
          label: 'Rollback...',
          click: () => send_to_renderer('menu:rollback'),
        },
        { type: 'separator' },
        {
          label: 'Destroy Infrastructure...',
          click: () => send_to_renderer('menu:destroy'),
        },
      ],
    },

    // Window Menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(is_mac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },

    // Help Menu
    {
      role: 'help',
      submenu: [
        {
          label: 'Getting Started',
          click: () => shell.openExternal('https://light-cloud.com/docs/getting-started'),
        },
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://light-cloud.com/docs'),
        },
        {
          label: 'API Reference',
          click: () => shell.openExternal('https://light-cloud.com/api'),
        },
        { type: 'separator' },
        {
          label: 'Community Forum',
          click: () => shell.openExternal('https://community.light-cloud.com'),
        },
        {
          label: 'GitHub',
          click: () => shell.openExternal('https://github.com/light-cloud-com/ice'),
        },
        { type: 'separator' },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/light-cloud-com/ice/issues/new'),
        },
        {
          label: 'Request Feature',
          click: () => shell.openExternal('https://github.com/light-cloud-com/ice/discussions/new'),
        },
        { type: 'separator' },
        {
          label: 'Check for Updates...',
          click: () => send_to_renderer('menu:checkUpdates'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Send menu action to focused renderer window
 */
function send_to_renderer(channel: string, ...args: unknown[]): void {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    window.webContents.send(channel, ...args);
  }
}
