const message = {
    "detail": {
        "LambdaCodeScanning": true,
        "LambdaStandardScanning": true,
    }
};

import { handler } from "./index.js";

console.log(new Date().toISOString());

(async () => {
  let result = await handler(message);
  console.log(result);
})();
