import { useEffect, useRef, useState } from 'react';

const SIGNAL_SERVER_URL = 'ws://localhost:3002';

interface IFile {
  name: string;
  size: number;
  type: string;
  isDirectory: boolean;
  path: string;
}

interface IShareFolder {
  folderPath: string;
  files: IFile[];
}

function App(): React.JSX.Element {

  const [ selectedShareDirectory, setSelectedShareDirectory ] = useState<IShareFolder | null>(null);
  const [ selectedTargetShareDirectory, setSelectedTargetShareDirectory ] = useState<IShareFolder | null>(null);

  const [ isConnected, setIsConnected] = useState<boolean>(false);
  const [ iniciandoConexion, setIniciandoConexion ] = useState(false);
  const [ clientsConnected, setClientsConnected ] = useState<string[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [textData, setText] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
  const wsRef = useRef<WebSocket | null>(null);


  const connectToPeer = (initiator: boolean) => {
    window.electron.ipcRenderer.invoke('create-peer', {
      initiator, targetId
    });
  }

  const initConection = () => {
    if(!targetId) return;

    wsRef.current?.send(JSON.stringify({
      to: targetId,
      type: 'InitiateConnection',
    }));

    window.electron.ipcRenderer.invoke('create-peer', {
      initiator: true, targetId
    });
  }

  const initWaitConnection = (clientID: string) => {
    console.log('iniciando como espera', clientID);
    window.electron.ipcRenderer.invoke('create-peer', {
      initiator: false, targetId: clientID
    });
  }

  const enviarInfo = () => {
    if(!textData) return;

    window.electron.ipcRenderer.send('send-data', {
        targetId,
        message: textData,
      });
  }

  const selectShareDirectory = async () => {
    const selectedFolder = await window.electron.ipcRenderer.invoke('select-folder');
    setSelectedShareDirectory(selectedFolder);
  }

  const downloadFile = (pathFile: string, fileName: string) => {
    if(!targetId) return;
    if(!isConnected) return;

    wsRef.current?.send(JSON.stringify({
      to: targetId,
      type: 'DownloadFile',
      data: {
        pathFile,
        fileName,
      }
    }));
  }

  useEffect(() => {
      const ws = new WebSocket(SIGNAL_SERVER_URL);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        console.log(msg);
        if (msg.type === 'Connected') {
          setMyId(msg.id);
        } else if (msg.type === 'offer') {
          setTargetId(msg.from);
            window.electron.ipcRenderer.send('signal-peer', {
              targetId: msg.from,
              data: { ...msg.peerData }
            });
        } else if (msg.type === 'answer') {
          window.electron.ipcRenderer.send('signal-peer', {
            targetId: msg.from,
            data: { ...msg.peerData }
          });
        } else if (msg.type === 'ConnectedClients') {
          setClientsConnected(msg.clients);
        }else if(msg.type == 'InitiateConnection') {
          initWaitConnection(msg.from);
        }else if(msg.type === 'ShareFolderDirectory') {
          setSelectedTargetShareDirectory(msg.data);
        }else if(msg.type === 'DownloadFile') {
          const { pathFile } = msg.data;
          window.electron.ipcRenderer.send('send-file', {
            targetId: msg.from,
            filePath: pathFile,
          });
        }
      }

      return () => {
        ws.close();
      };
  }, []);

  useEffect(()=>{
    const handlePeerSignal = (_, { data, targetId }) => {
      wsRef.current?.send(
        JSON.stringify({
          to: targetId,
          peerData: { ...data },
        })
      );
    };

    window.electron.ipcRenderer.on('peer-signal', handlePeerSignal);

    return () => {
      window.electron.ipcRenderer.removeAllListeners('peer-signal');
    };
  }, []);

  useEffect(()=>{
    const handleIsconnected = (_, { targetId }) => {
      setIsConnected(true);
    }

    window.electron.ipcRenderer.on('peer-connected', handleIsconnected);

    return () => {
      window.electron.ipcRenderer.removeAllListeners('peer-connected');
    };
  }, [])

  useEffect(()=>{
    if(!selectedShareDirectory) return;
    if(!targetId) return;

    wsRef.current?.send(JSON.stringify({
      to: targetId,
      type: 'ShareFolderDirectory',
      data: selectedShareDirectory,
    }));

  }, [selectedShareDirectory, targetId])

  return (
    <>
      <div>
        <p>P2P Onefacture</p>
        <div>
          { isConnected &&
          <h3>Conexión establecida</h3>
          }
          <h2>Mi ID: {myId}</h2>

          <br />
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Clientes conectados</th>
              </tr>
            </thead>
            <tbody>
              {clientsConnected.filter(clientId => clientId !== myId).map(clientId => (
                <tr key={clientId}>
                  <td>
                    <input type="radio" name="targetId" id={clientId} onChange={() => setTargetId(clientId)} style={{ marginRight: '1rem' }} />
                    <input type="text" value={clientId} readOnly  style={{ width: '90%' }}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <br />
          { clientsConnected.length > 0 &&
          <button disabled={!targetId} onClick={initConection}>Iniciar conexión</button>
          }
          <button onClick={selectShareDirectory} style={{ marginLeft: '1rem' }}>
            Seleccionar carpeta compartida
          </button>

          <br />
          <br />
          <div style={{ width: '100%', background: '#FFF', color: 'gray', paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1rem', paddingBottom: '1rem' }}>
            <table style={{ width: '100%' }}>
              <tbody>
                {selectedTargetShareDirectory?.files.map(file => (
                  <tr key={file.path} style={{ borderBottom: '1px solid #ccc' }}>
                    <td>
                      { isConnected &&
                      <button onClick={()=>downloadFile(file.path, file.name)}>
                        Descargar
                      </button>
                      }
                    </td>
                    <td>{file.name}</td>

                    <td>{file.type}</td>
                    <td>{file.path}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
        <div>
          <br /><br />
          <textarea value={textData ?? ''} onChange={e => setText(e.target.value)}></textarea>
          <br />
          <button onClick={enviarInfo}>Enviar</button>
        </div>
      </div>
    </>
  )
}

export default App
