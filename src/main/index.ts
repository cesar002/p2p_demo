import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import Peer from 'simple-peer';
import wrtc from 'wrtc';
import fs from 'fs';
import path from 'path';

const peers = new Map<string, InstanceType<typeof Peer>>();
const fileBuffers: Record<string, { chunks: string[], received: number, total: number, originalSize: number }> = {};

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

    //Receptor de datos, canal de datos
    peer.on('data', (data) => {
        try {
          const packet = JSON.parse(data.toString());

          if (packet.type === 'file-base64-chunk') {
            if (!fileBuffers[packet.fileName]) {
              fileBuffers[packet.fileName] = {
                chunks: new Array(packet.totalChunks),
                received: 0,
                total: packet.totalChunks,
                originalSize: packet.fileSize
              };
            }

            // Almacenar chunk en su posición correcta
            fileBuffers[packet.fileName].chunks[packet.chunkIndex] = packet.data;
            fileBuffers[packet.fileName].received++;

            // Verificar completitud
            if (fileBuffers[packet.fileName].received === packet.totalChunks) {
              const completeBase64 = fileBuffers[packet.fileName].chunks.join('');
              const fileBuffer = Buffer.from(completeBase64, 'base64');

              // Validar tamaño
              if (fileBuffer.length !== fileBuffers[packet.fileName].originalSize) {
                throw new Error(`Tamaño incorrecto: Esperado ${fileBuffers[packet.fileName].originalSize}, recibido ${fileBuffer.length}`);
              }

              const filePath = path.join(app.getPath('downloads'), packet.fileName);
              fs.writeFileSync(filePath, fileBuffer);

              console.log('Archivo recibido y guardado:', packet.fileName);

              delete fileBuffers[packet.fileName];
            }
          }
        } catch (error) {
          console.error('Error processing file chunk:', error);
        }

      // try {
      //   const packet = JSON.parse(data.toString());

      //   if (packet.type === 'file-chunk') {
      //     if (!receivedFiles[packet.fileName]) {
      //       receivedFiles[packet.fileName] = {
      //         chunks: [],
      //         total: packet.totalChunks
      //       };
      //     }

      //     receivedFiles[packet.fileName].chunks[packet.chunkIndex] = packet.data;

      //     // Verificar si hemos recibido todos los chunks
      //     const fileInfo = receivedFiles[packet.fileName];
      //     if (fileInfo.chunks.length === fileInfo.total) {
      //       const completeFile = Buffer.concat(fileInfo.chunks);
      //       const filePath = path.join(app.getPath('downloads'), packet.fileName);

      //       fs.writeFile(filePath, completeFile, (err) => {
      //         if (err) {
      //           console.error('Error guardando archivo:', err);
      //         } else {
      //           console.log('Archivo guardado:', filePath);
      //         }
      //       });

      //       delete receivedFiles[packet.fileName];
      //     }
      //   }
      // } catch (error) {
      //   console.error('Error procesando datos:', error);
      // }

    });

    // Manejar errores
    peer.on('error', (err) => {
        console.error('Peer error:', err);
        event.sender.send('peer-error', { targetId, error: err.message });
      });

      return true; // Confirmar creación
  });

  ipcMain.on('send-file', async (event, { targetId, filePath, fileName, fileSize }) => {
    const peer = peers.get(targetId);
    if(!peer) return;

    try {
      const fileBuffer = await fs.promises.readFile(filePath);
      const base64String = fileBuffer.toString('base64');
      const CHUNK_SIZE = 65536; // Tamaño en caracteres Base64 (no en bytes)

      for (let i = 0; i < Math.ceil(base64String.length / CHUNK_SIZE); i++) {
        const chunk = base64String.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

        peer.send(JSON.stringify({
          type: 'file-base64-chunk',
          fileName,
          chunkIndex: i,
          totalChunks: Math.ceil(base64String.length / CHUNK_SIZE),
          data: chunk,
          fileSize: fileBuffer.length // Tamaño original en bytes
        }));
      }
    } catch (error) {
      console.error('Error sending file:', error);
    }


    // // Leer el archivo y enviarlo por chunks
    // const stream = fs.createReadStream(filePath);
    // let chunkIndex = 0;

    // stream.on('data', (chunk) => {
    //   const packet = {
    //     type: 'file-chunk',
    //     fileName,
    //     fileSize,
    //     chunkIndex,
    //     totalChunks: Math.ceil(fileSize / (16 * 1024)),
    //     data: chunk
    //   };

    //   peer.send(JSON.stringify(packet));
    //   chunkIndex++;
    // });

    // stream.on('end', () => {
    //   console.log('Archivo enviado completamente');
    // });
  });

  // Para enviar señales recibidas del otro peer (vía WebSocket)
  ipcMain.on('signal-peer', (event, { targetId, data }) => {
    console.log('aqui');
    console.log(targetId);
    const peer = peers.get(targetId);
    console.log(data);
    if (peer) peer.signal(data);
  });

  // Para enviar datos al peer remoto
  ipcMain.on('send-data', (event, { targetId, message }) => {
    const peer = peers.get(targetId);
    if (peer) peer.send(message);
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });

    if (result.canceled) return null;

    const folderPath = result.filePaths[0];
    const files = fs.readdirSync(folderPath);

    const fileDetails = files.map(fileName => {
        const fullPath = path.join(folderPath, fileName);
        const stats = fs.statSync(fullPath);

        return {
            name: fileName,
            path: fullPath,
            size: stats.isFile() ? stats.size : null, // Tamaño solo si es archivo
            type: stats.isFile() ? path.extname(fileName) : 'folder',
            isDirectory: stats.isDirectory()
        };
    }).filter(file => !file.isDirectory);

    return {
        folderPath,
        files: fileDetails
    };
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
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

function isJsonString(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}
