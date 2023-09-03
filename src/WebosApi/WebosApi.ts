import { WebSocket, Data, ErrorEvent } from 'ws';
import { regMessage } from './registrationData.js';
import { EventEmitter } from 'events';
import { WebosUri, webosUriList } from './webosUri.js';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

type keysData = {
  keys: { [conn: string]: string };
};

export class WebosApi extends EventEmitter {
  private ip = '';
  private secure = false;
  private ws!: WebSocket;
  private clientKey = '';
  private uid = 0;
  private wsUri = '';
  private wsOptions = {};
  private paired = false;
  private db: Low<keysData>;
  private keysData: keysData = { keys: {} };
  private reconnectState = false;
  private reconnectJob!: NodeJS.Timer;

  constructor({ ip = '127.0.0.1', secure = false, keysFile = './keys.json' } = {}) {
    super();
    this.ip = ip;
    this.secure = secure;

    this.wsUri = (this.secure ? 'wss://' : 'ws://') + this.ip + (this.secure ? ':3001' : ':3000');
    this.wsOptions = this.secure
      ? {
          rejectUnauthorized: false,
        }
      : {};
    this.db = new Low(new JSONFile<keysData>(keysFile));
    this.initKey();
  }

  private async initKey(): Promise<void> {
    await this.db.read();
    this.keysData = this.db.data || this.keysData;
    this.clientKey = this.keysData.keys[this.wsUri] || '';
    console.log(this.wsUri + ' - Client key: ' + this.clientKey);
  }

  private async writeKey(): Promise<void> {
    this.db.data = this.keysData;
    await this.db.write();
  }

  private async renewClientKey(clientKey: string): Promise<void> {
    console.log(this.wsUri + ' - Key renew: ' + clientKey);
    this.clientKey = clientKey;
    this.keysData.keys[this.wsUri] = clientKey;
    this.writeKey();
  }

  public connect() {
    this.ws = new WebSocket(this.wsUri, this.wsOptions);

    this.ws.on('open', () => {
      console.log(this.wsUri + ' - Connected to WebSocket server ');
      if (this.reconnectJob) {
        console.log(this.wsUri + ' - Stop reconnecting ');
        clearInterval(this.reconnectJob);
      }
      this.reconnectState = false;
      regMessage.payload['client-key'] = this.clientKey;
      this.ws.send(JSON.stringify(regMessage));
    });

    this.ws.on('message', (data: Data) => {
      const res = JSON.parse(data.toString());
      if (res.type === 'registered') {
        const clientKey = res.payload['client-key'];
        console.log(this.wsUri + ' - Paired with client-key: ' + clientKey);
        this.setPairingState(true);
        if (this.clientKey != clientKey) {
          this.renewClientKey(clientKey);
        }
      } else if (res.type === 'error' && res.id.toString().includes('register')) {
        this.setPairingState(false);
        console.error(this.wsUri + ' - Pairing error:');
        console.error(res);
      } else if (res.type === 'response' && res.id === -999 && res.payload.alertId) {
        //auto close alert for luna hack
        const alertId = res.payload.alertId;
        this.sendCommand('request', webosUriList['close_alert'].type + '://' + webosUriList['close_alert'].uri, {
          alertId: alertId,
        });
      } else {
        console.log(this.wsUri + ' - ' + JSON.stringify(res));
      }
    });

    this.ws.on('close', () => {
      console.log(this.wsUri + ' - Disconnected from WebSocket server');
      console.log(this.wsUri + ' - Trying to reconnect in 60 seconds');
      if (!this.reconnectState) {
        this.reconnectJob = setInterval(() => {
          this.connect();
          console.log(this.wsUri + ' - Reconnecting');
        }, 60000);
        this.reconnectState = true;
      }
    });

    this.ws.on('error', (err: ErrorEvent) => {
      console.error(this.wsUri + ' - WebSocket error:', err.message);
    });
  }

  private sendCommand(cmdType: string, uri: string, payload = {}, uid = 0) {
    const message = {
      id: uid < 0 ? uid : this.uid,
      type: cmdType,
      uri: uri,
      payload: payload,
    };
    this.ws.send(JSON.stringify(message));
    this.uid += 1;
  }

  private sendLuna(uri: string, params = {}): void {
    //alert hack to call internal luna api
    const buttons = [{ label: '', onClick: uri, params: params }];
    const payload = {
      message: ' ',
      buttons: buttons,
      onclose: { uri: uri, params: params },
      onfail: { uri: uri, params: params },
    };
    this.sendCommand(
      'request',
      webosUriList['create_alert'].type + '://' + webosUriList['create_alert'].uri,
      payload,
      -999, // special uid to detect luna hack alerts
    );
  }

  public sendRequest(webosUri: WebosUri, payload = {}): void {
    if (webosUri.type === 'ssap') {
      this.sendCommand('request', webosUri.type + '://' + webosUri.uri, payload);
    } else if (webosUri.type === 'luna') {
      this.sendLuna(webosUri.type + '://' + webosUri.uri, payload);
    }
  }

  public isPaired(): boolean {
    return this.paired;
  }

  public setPairingState(value: boolean): void {
    if (this.paired != value) {
      this.paired = value;
      value ? this.emit('paired') : this.emit('unpaired');
    }
  }
}

export { webosUriList } from './webosUri.js';
