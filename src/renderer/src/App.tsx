import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'
import { useEffect, useRef, useState } from 'react';

const SIGNAL_SERVER_URL = 'ws://localhost:3002';

function App(): React.JSX.Element {
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

  useEffect(() => {
      const ws = new WebSocket(SIGNAL_SERVER_URL);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        console.log(msg);
        if (msg.type === 'Connected') {
          setMyId(msg.id);
        } else if (msg.type === 'offer') {
            window.electron.ipcRenderer.send('signal-peer', {
              targetId: msg.from,
              data: { ...msg.peerData }
            });
        } else if (msg.type === 'answer') {

        } else if (msg.type === 'ConnectedClients') {
          setClientsConnected(msg.clients);
        }else if(msg.type == 'InitiateConnection') {
          initWaitConnection(msg.from);
        };
      }

      return () => {
        ws.close();
      };
    }, []);

    useEffect(()=>{
      window.electron.ipcRenderer.on('peer-signal', (_, { data, targetId }) => {
        wsRef.current?.send(JSON.stringify({
          to: targetId,
          peerData: {
            ...data,
          }
        }));
      });
    }, []);

  return (
    <>
      <div>
        <p>P2P Onefacture</p>
        <div>
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
          <button disabled={!targetId} onClick={initConection}>Iniciar conexión</button>

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
