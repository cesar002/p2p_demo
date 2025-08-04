import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import Peer from 'simple-peer';
import wrtc from 'wrtc';

const peers = new Map<string, InstanceType<typeof Peer>>();

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'));

  ipcMain.handle('create-peer', (event, { initiator, targetId }) => {
    const peer = new Peer({
      initiator,
      trickle: false,
      wrtc,
      config: {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      },
    });

    peers.set(targetId, peer);

    // Escuchar señales y enviarlas al renderer
    peer.on('signal', (data) => {
      console.log(data);
      event.sender.send('peer-signal', { targetId, data });
    });

    peer.on('connect', () => {
      console.log('connect');
      event.sender.send('peer-connected', { targetId });
    });

    peer.on('data', (data) => {
      console.log('data', data);
      event.sender.send('peer-data', { targetId, data: data.toString() });
    });

    // Manejar errores
    peer.on('error', (err) => {
        console.error('Peer error:', err);
        event.sender.send('peer-error', { targetId, error: err.message });
      });

      return true; // Confirmar creación
  });

  // Para enviar señales recibidas del otro peer (vía WebSocket)
  ipcMain.on('signal-peer', (event, { targetId, data }) => {
    console.log('aqui');
    console.log(targetId);
    console.log(Array.from(peers.entries()));
    const peer = peers.get(targetId);
    console.log(peer);
    if (peer) peer.signal(data);
  });

  // Para enviar datos al peer remoto
  ipcMain.on('send-data', (event, { targetId, message }) => {
    const peer = peers.get(targetId);
    if (peer) peer.send(message);
  });

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
