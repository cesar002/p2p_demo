export {};

declare global {
  interface Window {
    p2p: {
      startPeer: (targetId: string, initiator: boolean) => void;
      sendMessage: (msg: string) => void;
      onId: (cb: (id: string) => void) => void;
      onConnect: (cb: () => void) => void;
      onData: (cb: (data: string) => void) => void;
    };
  }
}
