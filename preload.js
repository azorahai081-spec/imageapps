// preload.js
const { contextBridge, ipcRenderer } = require('electron');
// No Node.js modules allowed here due to contextIsolation:true

contextBridge.exposeInMainWorld('electronAPI', {
  // --- NEW: Separate handlers for files and folders ---
  addImageFiles: () => ipcRenderer.invoke('add-image-files'),
  addImageFolders: () => ipcRenderer.invoke('add-image-folders'),
  
  // Existing functions
  loadImages: () => ipcRenderer.invoke('load-images'),
  saveDescription: (data) => ipcRenderer.invoke('save-description', data),
  removeImage: (id) => ipcRenderer.invoke('remove-images', id), // Point to bulk handler
  describeImage: (data) => ipcRenderer.invoke('describe-image', data),
  openFolder: (filePath) => ipcRenderer.send('open-folder', filePath),
  saveTags: (data) => ipcRenderer.invoke('save-tags', data),
  removeImagesBulk: (ids) => ipcRenderer.invoke('remove-images', ids),
  getAIPrompts: () => ipcRenderer.invoke('get-ai-prompts'),

  // readFileAsBlob remains the same
  readFileAsBlob: async (filePath) => {
    try {
        console.log(`Preload: Requesting blob data for ${filePath}`);
        const result = await ipcRenderer.invoke('read-file-as-blob', filePath);

        if (result && !result.success && result.error) {
            console.error(`Preload: Error received from main for ${filePath}: ${result.error}`);
            return null;
        }
        if (!result || !result.success || !(result.data instanceof ArrayBuffer) || typeof result.mimeType !== 'string') {
             console.error(`Preload: Received invalid data structure from main for ${filePath}`, result);
             return null;
        }

        const arrayBuffer = result.data;
        const mimeType = result.mimeType;
        console.log(`Preload: Received buffer for ${filePath}, length: ${arrayBuffer.byteLength}, mimeType: ${mimeType}`);

        return new Blob([arrayBuffer], { type: mimeType });
    } catch (error) {
      console.error(`Preload: Error invoking read-file-as-blob for ${filePath}:`, error);
      return null;
    }
  }
});

// Listener for main process messages (optional)
ipcRenderer.on('from-main', (event, ...args) => {
  console.log('Received from main:', ...args);
});

