// preload.js
const { contextBridge, ipcRenderer } = require('electron');
const path = require('path'); // Node path needed here

contextBridge.exposeInMainWorld('electronAPI', {
  addImages: () => ipcRenderer.invoke('add-images'),
  loadImages: () => ipcRenderer.invoke('load-images'),
  saveDescription: (data) => ipcRenderer.invoke('save-description', data),
  removeImage: (id) => ipcRenderer.invoke('remove-image', id),
  describeImage: (data) => ipcRenderer.invoke('describe-image', data),
  openFolder: (filePath) => ipcRenderer.send('open-folder', filePath), // Use send for one-way

  // Function to read file as Blob data (ArrayBuffer)
  readFileAsBlob: async (filePath) => {
    try {
        console.log(`Preload: Requesting buffer for ${filePath}`);
        const result = await ipcRenderer.invoke('read-file-as-buffer', filePath);

        // Check if the main process returned an error object
        if (result && result.error) {
            console.error(`Preload: Error received from main for ${filePath}: ${result.error}`);
            return null; // Indicate failure
        }

        // Check if we received an ArrayBuffer
        if (!(result instanceof ArrayBuffer)) {
             console.error(`Preload: Received data is not an ArrayBuffer for ${filePath}`, result);
             return null; // Indicate failure
        }

        console.log(`Preload: Received buffer for ${filePath}, length: ${result.byteLength}`);

        // Determine MIME type (could be passed back or inferred again here)
        const ext = path.extname(filePath).toLowerCase(); // Use path from require
        let mimeType = 'image/jpeg'; // Default
        const mimeMap = {
           '.png': 'image/png',
           '.jpg': 'image/jpeg',
           '.jpeg': 'image/jpeg',
           '.webp': 'image/webp',
           '.gif': 'image/gif',
           '.bmp': 'image/bmp',
        };
        mimeType = mimeMap[ext] || mimeType;

        return new Blob([result], { type: mimeType });

    } catch (error) {
      // Catch errors thrown by ipcRenderer.invoke itself (e.g., if main handler rejects)
      console.error(`Preload: Error invoking read-file-as-buffer for ${filePath}:`, error);
      return null; // Indicate failure
    }
  }
});

// Listener for main process messages (optional)
ipcRenderer.on('from-main', (event, ...args) => {
  console.log('Received from main:', ...args);
});

