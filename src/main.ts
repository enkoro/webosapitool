import { webosUriList } from './WebosApi/WebosApi.js';
import express from 'express';
import { config } from './config.js';

const app = express();
const port = process.env.PORT || 8123;
app.use(express.json());

app.post('/:entity/:method', (req, res) => {
  const { entity, method } = req.params;
  const payload = req.body;
  if (config[entity]) {
    if (method in webosUriList) {
      if (config[entity].ws?.isPaired()) {
        config[entity].ws?.sendRequest(webosUriList[method], payload);
        res.send(`Sent ${method} to ${entity} with payload ${JSON.stringify(payload)}`);
      } else {
        console.error(`Endpoint ${entity} not paired`);
        res.send(`Endpoint ${entity} not paired`);
      }
    } else {
      console.log(`No method with name ${method}`);
      res.send(`No method with name ${method}`);
    }
  } else {
    console.log(`No endpoint with name ${entity}`);
    res.send(`No endpoint with name ${entity}`);
  }
});

app.listen(port, () => {
  console.log('Server listening on port ' + port);
});

//TODO: docker external volume for config and keys
