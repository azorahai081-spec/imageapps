// electron.js - Main Process
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path'); // Use regular path require
const fsSync = require('fs'); // Use SYNCHRONOUS fs for initial setup
const fs = require('fs').promises; // Use promises version of fs
const crypto = require('crypto');
const low = require('lowdb'); // <--- Use require for lowdb v1
const FileSync = require('lowdb/adapters/FileSync'); // <--- Adapter for lowdb v1
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Added for Gemini

console.log("--- Electron Main Process Starting ---");

// --- Dynamically import electron-is-dev ---
let electronIsDev;
const electronIsDevPromise = import('electron-is-dev')
    .then(module => {
        electronIsDev = module.default;
        console.log("electron-is-dev loaded successfully:", electronIsDev);
        return electronIsDev;
    })
    .catch(err => {
        console.error("Failed to load electron-is-dev:", err);
        electronIsDev = false;
        return electronIsDev;
    });
// --- End dynamic import ---

// --- Database Setup ---
let db;
const dbPath = path.join(app.getPath('userData'), 'ai-image-tagger-db.json'); // Unique DB name

function initializeDatabase() {
    try {
        const userDataPath = app.getPath('userData');
        fsSync.mkdirSync(userDataPath, { recursive: true });
        console.log(`Database path: ${dbPath}`);
        const adapter = new FileSync(dbPath);
        db = low(adapter);
        db.defaults({ images: [] }).write();
        // Migration: Ensure all existing images have 'tags' and 'folderName'
        let needsWrite = false;
        const images = db.get('images').value() || [];
        images.forEach(img => {
            let updated = false;
            if (!Array.isArray(img.tags)) {
                img.tags = [];
                updated = true;
            }
             if (!img.folderName && img.path) { // Check if path exists before getting dirname
                 try {
                    img.folderName = path.basename(path.dirname(img.path));
                    updated = true;
                 } catch (e) {
                     console.warn(`Could not determine folder name for path: ${img.path}`, e);
                     img.folderName = 'Unknown'; // Fallback
                     updated = true;
                 }
            }
            if (updated) {
                 // Update the item in the database directly within the loop
                 db.get('images').find({ id: img.id }).assign({ tags: img.tags, folderName: img.folderName }).value(); // Assign but don't write yet
                 needsWrite = true;
            }
        });
        if (needsWrite) {
            db.write(); // Write all changes at once after the loop
            console.log("Performed migration for tags/folderName fields.");
        }
        console.log("Database initialized successfully at:", dbPath);
        return true;
    } catch (error) {
        console.error("Failed to initialize database:", error);
        handleDBInitializationError(error);
        return false;
    }
}

function handleDBInitializationError(error) {
     console.error("Database initialization failed:", error);
     try {
        dialog.showErrorBox("Database Error", `Failed to initialize the database at ${dbPath}. Please check permissions or delete the file if corrupted. Error: ${error.message}`);
     } catch (dialogError) {
         console.error("Failed to show database error dialog:", dialogError);
     }
     db = null;
}

// --- Constants ---
const GEMINI_API_KEY = "AIzaSyAOshiEgqwGdqyR4A2q0KxwJSj13Flw7d4"; // <--- PUT YOUR API KEY HERE
const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// --- Predefined AI Prompts ---
const AI_PROMPTS = {
    basic: "Describe this image concisely.",
    creative: "Write a vivid and detailed creative caption for this image.",
    midjourney: "Generate a descriptive prompt, focusing on visual elements, style, and composition, suitable for an AI image generator like Midjourney.",
    product: "Write a short, engaging product description based on this image for an e-commerce listing.",
    dataset: "Provide a neutral, objective caption describing the main subject and scene for a dataset.",
};

// --- Gemini AI Setup ---
let genAI;
let generativeModel;
if (GEMINI_API_KEY) {
  try {
     genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
     generativeModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });
     console.log("GoogleGenerativeAI initialized.");
  } catch (error) {
      console.error("Failed to initialize GoogleGenerativeAI:", error);
  }
} else {
    console.warn("Gemini API Key not found. AI Description feature will be disabled.");
}

// --- Main Window ---
function createWindow() {
   console.log("--- createWindow function called ---");
    if (typeof electronIsDev === 'undefined') {
        console.error("electron-is-dev was not loaded correctly and has no value. Defaulting to false.");
        electronIsDev = false;
    }
    console.log(`Is development environment? ${electronIsDev}`);

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Keep true for security
      nodeIntegration: false, // Keep false for security
      // webSecurity: !electronIsDev // Disable webSecurity in dev to load local files easier if needed, but risky
    },
    icon: path.join(__dirname, 'assets', 'icon.png') // Ensure 'assets/icon.png' exists
  });

   const startUrl = electronIsDev
     ? 'http://localhost:3000'
     : `file://${path.join(__dirname, '../build/index.html')}`;
    console.log("Loading URL:", startUrl);
    mainWindow.loadURL(startUrl);

  if (electronIsDev) {
    console.log("Opening DevTools because electronIsDev is true.");
    mainWindow.webContents.openDevTools();
  } else {
    console.log("Not opening DevTools because electronIsDev is false.");
  }

  // Error handling and ready-to-show
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`Failed to load URL: ${validatedURL}`);
    console.error(`Error Code: ${errorCode}`);
    console.error(`Description: ${errorDescription}`);
     try {
         dialog.showErrorBox(
          'Load Error',
           `Failed to load the application URL: ${validatedURL}\n\n${errorDescription}\n\nPlease ensure the React development server (npm start) is running or the production build exists.`
        );
     } catch (dialogError) {
         console.error("Failed to show load error dialog:", dialogError);
     }
  });
  mainWindow.once('ready-to-show', () => {
    console.log("--- Main window ready-to-show ---");
    mainWindow.show();
  });

  return mainWindow;
}

// --- App Lifecycle ---
app.whenReady().then(async () => {
    console.log("--- App is ready ---");
    await electronIsDevPromise; // Ensure electron-is-dev is loaded first
    console.log("--- electron-is-dev promise resolved ---");
    const dbInitialized = initializeDatabase();
    if (!dbInitialized || !db) {
         console.error("Database failed to initialize during app ready. Exiting.");
         if (electronIsDev) {
             console.log("Exiting in 5 seconds due to DB init failure...");
             await new Promise(resolve => setTimeout(resolve, 5000));
         }
         app.quit();
         return;
     }
    createWindow();
    app.on('activate', async () => {
       console.log("--- App activated ---");
        if (BrowserWindow.getAllWindows().length === 0) {
            if (!db) {
                console.error("DB not ready on activate, cannot create window.");
                return;
            }
             await electronIsDevPromise; // Ensure check happens here too
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
   console.log("--- All windows closed ---");
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC Handlers ---

// Helper function to recursively find image files in directories
async function findImageFiles(dirPath, fileList = []) {
    try {
        const dirents = await fs.readdir(dirPath, { withFileTypes: true });
        for (const dirent of dirents) {
            const fullPath = path.join(dirPath, dirent.name);
            if (dirent.isDirectory()) {
                // Optional: Add checks here to skip certain directories like node_modules, .git, etc.
                if (dirent.name === 'node_modules' || dirent.name.startsWith('.')) {
                    continue;
                }
                await findImageFiles(fullPath, fileList); // Recurse into subdirectories
            } else if (dirent.isFile()) {
                const ext = path.extname(dirent.name).toLowerCase();
                if (SUPPORTED_EXTENSIONS.has(ext)) {
                    fileList.push(fullPath);
                }
            }
        }
    } catch (error) {
        console.error(`Error scanning directory ${dirPath}:`, error);
        // Inform the user about specific directory scan errors - potentially via main window later
    }
    return fileList;
}

// --- NEW: Reusable function to add files to DB ---
async function addFilePathsToDB(filePaths) {
    if (!db) throw new Error("Database not initialized");
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
        return { success: true, newImages: [] }; // No files to add
    }

    const imagesCollection = db.get('images');
    if (!imagesCollection.value()) {
        db.set('images', []).write();
    }
    const existingPaths = new Set(db.get('images').map('path').value());
    const newImages = [];
    let addedCount = 0;

    for (const filePath of filePaths) {
        if (!existingPaths.has(filePath)) {
            // Check if it's a file and supported (in case dialog filters fail)
             try {
                const stats = await fs.stat(filePath);
                const ext = path.extname(filePath).toLowerCase();
                if (stats.isFile() && SUPPORTED_EXTENSIONS.has(ext)) {
                    const newImage = {
                        id: crypto.randomUUID(),
                        path: filePath,
                        description: '',
                        tags: [],
                        folderName: path.basename(path.dirname(filePath)),
                        last_updated: new Date().toISOString(),
                    };
                    imagesCollection.push(newImage).value(); // Add to in-memory collection
                    newImages.push(newImage);
                    existingPaths.add(filePath);
                    addedCount++;
                }
            } catch (statError) {
                 console.error(`Error statting file ${filePath}:`, statError);
            }
        } else {
            console.log(`Skipped existing image: ${filePath}`);
        }
    }

    if (addedCount > 0) {
        db.write(); // Write all changes at once
        console.log(`Added ${addedCount} new images.`);
    }
    return { success: true, newImages: newImages };
}


// --- NEW: Handler for adding *Files* only ---
ipcMain.handle('add-image-files', async (event) => {
    try {
        const result = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Images', extensions: Array.from(SUPPORTED_EXTENSIONS).map(ext => ext.substring(1)) }],
        });

        if (result.canceled || result.filePaths.length === 0) {
            console.log("File selection cancelled.");
            return { success: true, newImages: [] };
        }

        console.log("Selected files:", result.filePaths);
        return await addFilePathsToDB(result.filePaths); // Use the reusable function

    } catch (error) {
        console.error("Error adding image files:", error);
        return { success: false, error: error.message, newImages: [] };
    }
});

// --- NEW: Handler for adding *Folders* only ---
ipcMain.handle('add-image-folders', async (event) => {
    try {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'multiSelections'],
            // Filters don't work reliably for 'openDirectory'
        });

        if (result.canceled || result.filePaths.length === 0) {
            console.log("Folder selection cancelled.");
            return { success: true, newImages: [] };
        }

        console.log("Selected folders:", result.filePaths);
        const allFilesToScan = [];

        for (const selectedPath of result.filePaths) {
             try {
                const stats = await fs.stat(selectedPath);
                if (stats.isDirectory()) {
                    console.log(`Scanning directory: ${selectedPath}`);
                    const filesInDir = await findImageFiles(selectedPath); // Get files recursively
                    allFilesToScan.push(...filesInDir);
                }
             } catch (statError) {
                 console.error(`Error processing path ${selectedPath}:`, statError);
             }
        }

        // Add all found files to the DB
        return await addFilePathsToDB(allFilesToScan);

    } catch (error) {
        console.error("Error adding image folders:", error);
        return { success: false, error: error.message, newImages: [] };
    }
});


// Read file, determine mime type, send back ArrayBuffer and mimeType
ipcMain.handle('read-file-as-blob', async (event, filePath) => {
    try {
        const buffer = await fs.readFile(filePath);
         if (!buffer) throw new Error("File read returned empty buffer.");
         // Ensure we get a distinct ArrayBuffer copy
         const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        const mimeType = getMimeType(filePath); // Get mime type here
        if (!mimeType) {
             console.warn(`Could not determine MIME type for ${filePath}, defaulting.`);
        }
        console.log(`Read ${arrayBuffer.byteLength} bytes for ${filePath}, mime: ${mimeType || 'unknown'}`);
        return { success: true, data: arrayBuffer, mimeType: mimeType || 'application/octet-stream' }; // Send mimeType back
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        // Ensure error is returned in the expected structure for preload
        return { success: false, error: error.message };
    }
});

// Load images, ensuring fields exist
ipcMain.handle('load-images', async () => {
    try {
        if (!db) throw new Error("Database not initialized");
        const images = db.get('images').value() || [];
        // Ensure necessary fields exist for all images
        images.forEach(img => {
            if (!Array.isArray(img.tags)) {
                img.tags = [];
            }
            if (!img.folderName && img.path) { // Recalculate if missing and path exists
                 try {
                     img.folderName = path.basename(path.dirname(img.path));
                 } catch (e) {
                     img.folderName = 'Unknown';
                 }
            } else if (!img.folderName) {
                img.folderName = 'Unknown'; // Fallback if path is somehow missing too
            }
        });
        console.log("Sending images to frontend:", images.length);
        return { success: true, images: images };
    } catch (error) {
        console.error('Error loading images:', error);
        return { success: false, error: error.message };
    }
});

// Get predefined AI Prompts
ipcMain.handle('get-ai-prompts', async () => {
    try {
        return { success: true, prompts: AI_PROMPTS };
    } catch (error) {
        console.error("Error getting AI prompts:", error);
        return { success: false, error: error.message };
    }
});


// Save only the description
ipcMain.handle('save-description', async (event, { id, description }) => {
    try {
        if (!db) throw new Error("Database not initialized");
        const imageChain = db.get('images').find({ id: id });
        const image = imageChain.value();
        if (image) {
            if (image.description !== description) {
                 imageChain.assign({ description: description, last_updated: new Date().toISOString() }).write();
                 console.log(`Saved description for image ID ${id}`);
            }
        } else {
             console.warn(`Image ID ${id} not found for saving description.`);
            return { success: false, error: 'Image not found' };
        }
        return { success: true };
    } catch (error) {
        console.error(`Error saving description for image ID ${id}:`, error);
        return { success: false, error: error.message };
    }
});

// Save only tags
ipcMain.handle('save-tags', async (event, { id, tags }) => {
    try {
        if (!db) throw new Error("Database not initialized");
        const imageChain = db.get('images').find({ id: id });
        const image = imageChain.value();
        if (image) {
            // Ensure tags is always an array
            const newTags = Array.isArray(tags) ? tags : [];
            const currentTags = Array.isArray(image.tags) ? image.tags : [];

            // Simple comparison (order matters)
            if (JSON.stringify(currentTags) !== JSON.stringify(newTags)) {
                imageChain.assign({ tags: newTags, last_updated: new Date().toISOString() }).write();
                console.log(`Saved tags for image ID ${id}:`, newTags);
            }
            return { success: true };
        } else {
            console.warn(`Image ID ${id} not found for saving tags.`);
            return { success: false, error: 'Image not found' };
        }
    } catch (error) {
        console.error(`Error saving tags for image ID ${id}:`, error);
        return { success: false, error: error.message };
    }
});

// Remove single or multiple images
ipcMain.handle('remove-images', async (event, imageIds) => {
    const idsToRemove = Array.isArray(imageIds) ? imageIds : [imageIds];
    if (idsToRemove.length === 0) return { success: true, removedCount: 0 };
    try {
        if (!db) throw new Error("Database not initialized");
        let removedCount = 0;
        let anyRemoved = false;
        idsToRemove.forEach(id => {
            // lowdb v1 remove modifies the collection directly but returns removed items
            const removedItems = db.get('images').remove({ id: id }).value();
            if (removedItems && removedItems.length > 0) {
                removedCount++;
                anyRemoved = true;
                console.log(`Removed image ID ${id} from DB.`);
            } else {
                console.warn(`Image ID ${id} not found for removal.`);
            }
        });
        if (anyRemoved) {
            db.write(); // Persist removals
        }
        console.log(`Attempted to remove ${idsToRemove.length} image(s), successfully removed ${removedCount}.`);
        return { success: true, removedCount: removedCount };
    } catch (error) {
        console.error(`Error removing image IDs ${idsToRemove.join(', ')}:`, error);
        return { success: false, error: error.message, removedCount: 0 };
    }
});


// Describe single image using Gemini (make sure prompt is used)
ipcMain.handle('describe-image', async (event, { filePath, prompt }) => {
    if (!GEMINI_API_KEY || !generativeModel) {
        return { success: false, error: 'AI Error: Gemini API key not configured or model failed to initialize.' };
    }
    // Use the provided prompt, default if missing
    const aiPrompt = prompt || AI_PROMPTS.basic;
    console.log(`Using AI Prompt: "${aiPrompt}"`);

    try {
        console.log(`Requesting AI description for: ${filePath}`);
        const imageBuffer = await fs.readFile(filePath);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = getMimeType(filePath);
        if (!mimeType) return { success: false, error: 'Could not determine image type.' };

        const imagePart = { inlineData: { data: base64Image, mimeType: mimeType } };

        let attempt = 0; const maxAttempts = 5; const initialDelay = 1000;
        while (attempt < maxAttempts) {
            try {
                const result = await generativeModel.generateContent([aiPrompt, imagePart]); // Use aiPrompt here
                const response = await result.response;
                // Add robust checking for text content
                const text = response && response.text ? response.text() : null;
                if (text === null) {
                    throw new Error('AI response did not contain text.');
                }
                console.log(`AI description received for ${filePath}`);
                return { success: true, description: text };
            } catch (error) {
                attempt++;
                console.warn(`Gemini API call attempt ${attempt} failed for ${filePath}:`, error.message);
                 if (attempt >= maxAttempts || error.message.includes('403') || error.message.includes('401')) { // Don't retry auth errors
                      console.error(`Gemini API call failed permanently for ${filePath}.`);
                     throw error; // Re-throw the last error
                 }
                const delay = initialDelay * Math.pow(2, attempt -1) + Math.random() * 1000; // Add jitter
                console.log(`Retrying Gemini API call in ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        // Should not be reached if maxAttempts > 0, but acts as a fallback
        throw new Error('Gemini API call failed after maximum retries.');

    } catch (error) {
        console.error(`Error calling Gemini API for ${filePath}:`, error);
         // Provide more specific error messages if possible
        let errorMessage = `AI Error: ${error.message}`;
        if (error.message.includes('API key not valid')) {
            errorMessage = 'AI Error: Invalid API Key. Please check your key in electron.js.';
        } else if (error.status === 429) {
             errorMessage = 'AI Error: Rate limit exceeded. Please wait and try again.';
        }
        return { success: false, error: errorMessage };
    }
});


// Helper function to determine MIME type
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.webp': 'image/webp', '.gif': 'image/gif'
    };
    return mimeMap[ext] || null;
}

// Open folder handler
ipcMain.handle('open-folder', (event, filePath) => {
   try {
        if (!filePath) throw new Error("No file path provided to open folder.");
        const dirPath = path.dirname(filePath);
        shell.openPath(dirPath).then(errorMessage => {
            if (errorMessage) console.error(`shell.openPath failed for ${dirPath}: ${errorMessage}`);
            else console.log(`Successfully requested to open directory: ${dirPath}`);
        });
        return { success: true };
   } catch (error) {
        console.error("Error in open-folder handler:", error);
        return { success: false, error: error.message };
   }
});

