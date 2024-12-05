# Build

```
npm ci
npm run compile
npm run bundle
```

Open in browser public/index.html

# Develop

```
npm run watch
```

and after making some changes run

```
npm run bundle
```



# Sample code
## File `app.js`:
``` js
"use strict";

const inboxModule = require("privmx-rpc").inbox;

const runSample = (async () => {
  const platformUrl = "http://localhost:9111/api/v2.0";
  const solutionId = "a03639a4-86ba-4aa0-a88c-91486f0a2635";
  
  const inboxId = "674dbb427068a532685b0c05";

  const api = await inboxModule.connectPublic(platformUrl, solutionId);
  const publicView = await api.getInboxPublicView(inboxId);

  let entryHandle;

  // check for files
  const fileInput = document.getElementById('inp');
  const withFile = fileInput.value.length !== 0;

  if (withFile) {
      const stream = fileInput.files[0].stream();
      const fileSize = fileInput.files[0].size;

      const fHandle = await api.createFileHandle(strToUInt8(""), strToUInt8(""), fileSize);
      
      console.log("Preparing entry...");
      entryHandle = await api.prepareEntry(inboxId, strToUInt8("some data"), [fHandle]);
        
      console.log("Sending file chunk by chunk...");
      const reader = stream.getReader();
      while( true ) {
          const result = await reader.read();
          if( !result || result.done ) { 
            break; 
          }
          await api.writeToFile(entryHandle, fHandle, result.value );
      }
  } else {
    console.log("no file selected. create entry without file");
    entryHandle = await api.prepareEntry(inboxId, strToUInt8("some data without files"), []);
  }
    
  await api.sendEntry(entryHandle);
  console.log("Entry sent.");
});


// helpers
function strToUInt8(text) {
  return (new TextEncoder()).encode(text);
}

function uInt8ToStr(arr) {
  return (new TextDecoder()).decode(arr);
}
```

## File `index.html`:
``` html
<!DOCTYPE html>
<html>
    <head>
        <script src="privmx-rpc.min-x.js"></script>
        <script src="app.js"></script>
    </head> 
    <body>
        <input type="file" id="inp">
        <br/>
        <button onclick="runSample()">Send form</button>
    </body>
</html>
```