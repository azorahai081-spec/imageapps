// electron.js - Main Process
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path'); // Use node:path for clarity
const fs = require('node:fs').promises; // Use promises version of fs
const crypto = require('node:crypto');
// const electronIsDevRequire = require('electron-is-dev'); // <-- REMOVED standard require
// const { JSONFile, Low } = require('lowdb'); // Keep lowdb v7 commented out
const low = require('lowdb'); // <--- Use require for lowdb v1
const FileSync = require('lowdb/adapters/FileSync'); // <--- Adapter for lowdb v1
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Added for Gemini

// --- Add this console log right at the beginning ---
console.log("--- Electron Main Process Starting ---");
// --- End of added log ---

// --- Dynamically import electron-is-dev ---
let electronIsDev;
const electronIsDevPromise = import('electron-is-dev')
    .then(module => {
        electronIsDev = module.default; // Assign the default export
        console.log("electron-is-dev loaded successfully:", electronIsDev);
        return electronIsDev; // Resolve the promise with the value
    })
    .catch(err => {
        console.error("Failed to load electron-is-dev:", err);
        electronIsDev = false; // Default to false if import fails
        return electronIsDev; // Resolve with the default value
    });
// --- End dynamic import ---


// --- Database Setup ---
// Determine the path for the db.json file
// Use app.getPath('userData') which is designed for this purpose
const dbPath = path.join(app.getPath('userData'), 'db.json');
console.log(`Database path: ${dbPath}`); // Log the determined path

// Configure lowdb v1 adapter
let db;
try {
    // Ensure the directory exists before creating the adapter
    fs.mkdir(app.getPath('userData'), { recursive: true })
      .then(() => {
        const adapter = new FileSync(dbPath); // Use FileSync adapter for v1
        db = low(adapter); // Initialize lowdb v1

        // Set default data if file doesn't exist or is empty
        db.defaults({ images: [] }).write(); // Use v1 defaults syntax
        console.log("Database initialized successfully at:", dbPath);
      })
      .catch(initError => {
        console.error("Failed to initialize database directory or file:", initError);
        handleDBInitializationError(initError);
      });

} catch (error) { // Catch synchronous errors during setup (less likely now)
     console.error("Synchronous error during database setup:", error);
     handleDBInitializationError(error);
}

function handleDBInitializationError(error) {
     console.error("Database initialization failed:", error);
     try {
         // Check if app is ready before using dialog
         if (app.isReady()) {
            dialog.showErrorBox("Database Error", `Failed to initialize the database at ${dbPath}. Please check permissions or delete the file if corrupted. Error: ${error.message}`);
         } else {
             // If app isn't ready, log to console as dialog might fail
             console.error("App not ready, cannot show dialog for DB error. DB Path:", dbPath, "Error:", error.message);
             // Attempt to show error later when app is ready
              app.on('ready', () => {
                 try {
                    dialog.showErrorBox("Database Error (Delayed)", `Failed to initialize the database at ${dbPath}. Please check permissions or delete the file if corrupted. Error: ${error.message}`);
                 } catch (lateDialogError) {
                     console.error("Failed to show delayed database error dialog:", lateDialogError);
                 }
                app.quit(); // Quit after showing the delayed dialog
             });

         }
     } catch (dialogError) {
         console.error("Failed to show database error dialog:", dialogError);
     }
      // Don't quit immediately if app isn't ready, let the 'ready' event handle it
     if (app.isReady()) {
         app.quit();
     }
     db = null; // Ensure db is null if failed
}


// --- Constants ---
const GEMINI_API_KEY = ""; // <--- PUT YOUR API KEY HERE

// Initialize GoogleGenerativeAI - Moved outside function
let genAI;
let generativeModel;
if (GEMINI_API_KEY) {
  try {
     genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
     generativeModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // Or your preferred model
     console.log("GoogleGenerativeAI initialized.");
  } catch (error) {
      console.error("Failed to initialize GoogleGenerativeAI:", error);
      // Keep running but AI features will fail later
  }
} else {
    console.warn("Gemini API Key not found. AI Description feature will be disabled.");
}

// --- Main Window ---
async function createWindow() { // Make async again to await the import
   // --- Add this console log ---
   console.log("--- createWindow function called ---");
   // --- End of added log ---

    // Ensure electronIsDev is loaded before using it
    await electronIsDevPromise; // Wait for the dynamic import to finish
    if (typeof electronIsDev === 'undefined') {
        // This case should ideally not happen if loadElectronIsDev sets a fallback
        console.error("electron-is-dev was not loaded correctly and has no value. Defaulting to false.");
        electronIsDev = false; // Ensure it has a fallback value
    }
    console.log(`Is development environment? ${electronIsDev}`); // Log the value after await

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Recommended for security
      nodeIntegration: false, // Recommended for security
    },
    icon: path.join(__dirname, 'assets', 'icon.png') // Example icon path
  });

   // Determine the URL to load
   const startUrl = electronIsDev
     ? 'http://localhost:3000' // Dev server URL
     : `file://${path.join(__dirname, '../build/index.html')}`; // Production build path

    // --- Add this console log ---
    console.log("Loading URL:", startUrl);
    // --- End of added log ---

    mainWindow.loadURL(startUrl);


  // Open DevTools automatically if in development
  if (electronIsDev) {
      console.log("Opening DevTools because electronIsDev is true.");
    mainWindow.webContents.openDevTools();
  } else {
      console.log("Not opening DevTools because electronIsDev is false.");
  }

   // --- Add listener for 'did-fail-load' ---
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error(`Failed to load URL: ${validatedURL}`);
        console.error(`Error Code: ${errorCode}`);
        console.error(`Description: ${errorDescription}`);
        // Optionally show an error message to the user
         try {
             dialog.showErrorBox(
              'Load Error',
               `Failed to load the application URL: ${validatedURL}\n\n${errorDescription}\n\nPlease ensure the React development server (npm start) is running or the production build exists.`
            );
         } catch (dialogError) {
             console.error("Failed to show load error dialog:", dialogError);
         }
    });
   // --- End of added listener ---

   // --- Add listener for 'ready-to-show' ---
    mainWindow.once('ready-to-show', () => {
        console.log("--- Main window ready-to-show ---");
        mainWindow.show(); // Show the window smoothly
    });
    // --- End of added listener ---

    return mainWindow; // Return the window object
}

// --- App Lifecycle ---
app.whenReady().then(async () => { // Make async
    // --- Add this console log ---
    console.log("--- App is ready ---");
    // --- End of added log ---

     if (!db) { // Check if DB initialization failed earlier
         console.error("Database failed to initialize. Exiting.");
         // Give user a chance to see console before quitting in dev
         if (electronIsDev) {
             console.log("Exiting in 5 seconds due to DB init failure...");
             await new Promise(resolve => setTimeout(resolve, 5000));
         }
         app.quit();
         return;
     }

    await createWindow(); // Await the async function

    app.on('activate', async () => { // Make async
        // --- Add this console log ---
        console.log("--- App activated ---");
        // --- End of added log ---
        if (BrowserWindow.getAllWindows().length === 0) {
            await createWindow(); // Await the async function
        }
    });
});

app.on('window-all-closed', () => {
   // --- Add this console log ---
   console.log("--- All windows closed ---");
   // --- End of added log ---
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC Handlers ---

// Function to read file as Blob data (ArrayBuffer)
ipcMain.handle('read-file-as-blob', async (event, filePath) => {
    try {
        console.log(`Reading file for blob: ${filePath}`); // Log path
        const buffer = await fs.readFile(filePath);
         // Convert Node.js Buffer to ArrayBuffer before sending
         // Make sure buffer exists before accessing properties
         if (!buffer) {
             throw new Error("File read returned empty buffer.");
         }
         const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        console.log(`Successfully read ${arrayBuffer.byteLength} bytes for blob.`);
        return { success: true, data: arrayBuffer };
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return { success: false, error: error.message };
    }
});


// Load existing images from DB
ipcMain.handle('load-images', async () => { // Keep async for potential future async operations
    try {
         if (!db) throw new Error("Database not initialized");
        // For lowdb v1, data is typically read synchronously at init or via db.read() explicitly if needed
        const images = db.get('images').value(); // Use v1 .get().value() syntax
        console.log("Sending images to frontend:", images ? images.length : 0);
        return { success: true, images: images || [] }; // Ensure images is always an array
    } catch (error) {
        console.error('Error loading images:', error);
        return { success: false, error: error.message };
    }
});

// Add new images
ipcMain.handle('add-images', async (event) => {
   try {
     if (!db) throw new Error("Database not initialized");

     const result = await dialog.showOpenDialog({
       properties: ['openFile', 'multiSelections'],
       filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
     });

     if (result.canceled || result.filePaths.length === 0) {
       console.log("Image selection cancelled.");
       return { success: true, newImages: [] }; // No error, just no new images
     }

     console.log("Selected file paths:", result.filePaths);

     const imagesCollection = db.get('images'); // Get collection reference v1
     if (!imagesCollection.value()) { // Ensure collection exists if db was empty
        db.set('images', []).write();
        imagesCollection = db.get('images');
     }
     const existingPaths = new Set(imagesCollection.map('path').value()); // Use v1 map/value syntax
     const newImages = [];

     for (const filePath of result.filePaths) {
       if (!existingPaths.has(filePath)) {
         const newImage = {
           id: crypto.randomUUID(), // Generate unique ID
           path: filePath,
           description: '',
           last_updated: new Date().toISOString(),
         };
         // Use push().write() for lowdb v1 to add and save
         imagesCollection.push(newImage).write();
         newImages.push(newImage); // Collect only the newly added ones
          existingPaths.add(filePath); // Add to set to prevent duplicate additions in the same batch
         console.log(`Added new image: ${filePath}`);
       } else {
         console.log(`Skipped existing image: ${filePath}`);
       }
     }
     // write() was called inside the loop for v1

     console.log(`Processed ${result.filePaths.length} files, added ${newImages.length} new images.`);
     return { success: true, newImages: newImages };
   } catch (error) {
       console.error("Error adding images:", error);
       return { success: false, error: error.message };
   }
});


// Save description for an image
ipcMain.handle('save-description', async (event, { id, description }) => { // Keep async
    try {
        if (!db) throw new Error("Database not initialized");
        const imageChain = db.get('images').find({ id: id }); // Use v1 find syntax
        const image = imageChain.value();

        if (image) {
            if (image.description !== description) { // Only write if changed
                 // Use assign().write() for lowdb v1 update
                 imageChain.assign({ description: description, last_updated: new Date().toISOString() }).write();
                 console.log(`Saved description for image ID ${id}`);
            } else {
                 console.log(`Description for image ID ${id} unchanged, skipped write.`);
            }
            return { success: true };
        } else {
             console.warn(`Image ID ${id} not found for saving description.`);
            return { success: false, error: 'Image not found' };
        }
    } catch (error) {
        console.error(`Error saving description for image ID ${id}:`, error);
        return { success: false, error: error.message };
    }
});

// Remove an image entry from DB
ipcMain.handle('remove-image', async (event, imageId) => { // Keep async
    try {
        if (!db) throw new Error("Database not initialized");
        // Use remove().write() for lowdb v1
        const result = db.get('images').remove({ id: imageId }).write();

         if (result && result.length > 0) { // remove returns the removed items in v1
             console.log(`Removed image ID ${imageId} from DB.`);
             return { success: true };
         } else {
              console.warn(`Image ID ${imageId} not found for removal.`);
             return { success: false, error: 'Image not found' };
         }
    } catch (error) {
        console.error(`Error removing image ID ${imageId}:`, error);
        return { success: false, error: error.message };
    }
});


// Describe image using Gemini
ipcMain.handle('describe-image', async (event, { filePath, prompt }) => {
  if (!GEMINI_API_KEY || !generativeModel) {
       console.error("Gemini API Key or Model not initialized.");
    return { success: false, error: 'AI Error: Gemini API key not configured or model failed to initialize.' };
  }

  try {
     console.log(`Requesting AI description for: ${filePath}`);
    const imageBuffer = await fs.readFile(filePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = getMimeType(filePath); // Helper to get MIME type

    if (!mimeType) {
        console.error(`Could not determine MIME type for ${filePath}`);
        return { success: false, error: 'Could not determine image type.' };
    }

    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: mimeType
      }
    };

     // Exponential backoff setup
     let attempt = 0;
     const maxAttempts = 5;
     const initialDelay = 1000; // 1 second

     while (attempt < maxAttempts) {
         try {
             const result = await generativeModel.generateContent([prompt, imagePart]);
             const response = await result.response;
             const text = response.text();
             console.log(`AI description received for ${filePath}`);
             return { success: true, description: text };
         } catch (error) {
             attempt++;
             console.warn(`Gemini API call attempt ${attempt} failed for ${filePath}:`, error.message);
             if (attempt >= maxAttempts) {
                  console.error(`Gemini API call failed after ${maxAttempts} attempts for ${filePath}.`);
                 throw error; // Re-throw the last error
             }
             // Wait before retrying
             const delay = initialDelay * Math.pow(2, attempt -1);
             console.log(`Retrying Gemini API call in ${delay}ms...`);
             await new Promise(resolve => setTimeout(resolve, delay));
         }
     }
      // Should not be reached if maxAttempts > 0, but acts as a fallback
      throw new Error('Gemini API call failed after maximum retries.');

  } catch (error) {
    console.error(`Error calling Gemini API for ${filePath}:`, error);
    return { success: false, error: `AI Error: ${error.message}` };
  }
});

// Helper function to determine MIME type from file extension
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
     case '.gif': return 'image/gif';
    // Add other supported types if needed
    default: return null;
  }
}

// Handle request to open image's folder
// Use invoke/handle pattern for consistency, even though it's one-way
ipcMain.handle('open-folder', (event, filePath) => {
   try {
        if (!filePath) {
            throw new Error("No file path provided to open folder.");
        }
       console.log(`Request received to open folder for: ${filePath}`);
       // Get the directory containing the file
       const dirPath = path.dirname(filePath);
       console.log(`Opening directory: ${dirPath}`);
       // Open the directory in the default file explorer
       shell.openPath(dirPath)
          .then(errorMessage => {
              if (errorMessage) {
                   console.error(`shell.openPath failed for ${dirPath}: ${errorMessage}`);
                    // Optionally send error back via event.sender.send if needed, but handle should return
              } else {
                   console.log(`Successfully requested to open directory: ${dirPath}`);
              }
          });
        return { success: true }; // Indicate the attempt was made
   } catch (error) {
        console.error("Error in open-folder handler:", error);
        return { success: false, error: error.message };
   }
});

