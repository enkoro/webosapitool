import { WebosApi } from './WebosApi/WebosApi.js';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

type Endpoint = {
  ip: string;
  secure: boolean;
  enabled: boolean;
  ws?: WebosApi;
};

type Config = {
  [key: string]: Endpoint;
};

let config: Config;

try {
  const db: Low<Config> = new Low(
    new JSONFile<Config>(process.env.CONFIG_DIR ? `${process.env.CONFIG_DIR}/config.json` : './config.json'),
  );
  console.log(process.env.CONFIG_DIR ? `${process.env.CONFIG_DIR}/config.json` : './config.json');
  await db.read();
  config = db.data || {};
  console.log(config);
  if (JSON.stringify(config) === '{}') {
    console.error('Empty config.');
    process.exit(1);
  }
} catch (e) {
  console.error('Config init error.');
  console.error(e);
  process.exit(1);
}

export { config };

const keysFile = `${process.env.CONFIG_DIR}/keys.json`;

for (const endpoint in config) {
  if (config[endpoint].enabled) {
    config[endpoint].ws = new WebosApi({
      ip: config[endpoint].ip,
      secure: config[endpoint].secure,
      keysFile,
    });
    if (config[endpoint].ws) {
      config[endpoint].ws?.connect();
    }
  }
}
