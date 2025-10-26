// electron.js - Main Process
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path'); // Use node:path for clarity
const fsSync = require('node:fs'); // Use SYNCHRONOUS fs for initial setup
const fs = require('node:fs').promises; // Use promises version of fs
const crypto = require('node:crypto');
const { JSONFile, Low } = require('lowdb');
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
// Declare db variable here, but initialize it inside whenReady
let db;
const dbPath = path.join(app.getPath('userData'), 'db.json'); // Define dbPath early for error messages

async function initializeDatabase() {
    try {
        const userDataPath = app.getPath('userData');
        console.log(`Ensuring directory exists: ${userDataPath}`);
        // Use synchronous mkdir before initializing adapter
        fsSync.mkdirSync(userDataPath, { recursive: true });

        console.log(`Database path: ${dbPath}`);
        const adapter = new JSONFile(dbPath); // Use JSONFile adapter for v7
        db = new Low(adapter, { images: [] }); // Initialize lowdb v7 with default data

        // Set default data if file doesn't exist or is empty
        await db.read();
        db.data = db.data || { images: [] }; // Set default data if file is empty
        await db.write();
        console.log("Database initialized successfully at:", dbPath);
        return true; // Indicate success
    } catch (error) {
        console.error("Failed to initialize database:", error);
        handleDBInitializationError(error);
        return false; // Indicate failure
    }
}

function handleDBInitializationError(error) {
     console.error("Database initialization failed:", error);
     try {
        // We know app is ready if we are inside whenReady().then()
        dialog.showErrorBox("Database Error", `Failed to initialize the database at ${dbPath}. Please check permissions or delete the file if corrupted. Error: ${error.message}`);
     } catch (dialogError) {
         console.error("Failed to show database error dialog:", dialogError);
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

    // *** MOVED DATABASE INITIALIZATION HERE ***
    const dbInitialized = initializeDatabase();

     if (!dbInitialized || !db) { // Check if DB initialization failed
         console.error("Database failed to initialize during app ready. Exiting.");
         // Give user a chance to see console before quitting in dev
         await electronIsDevPromise; // Make sure we know if it's dev mode
         if (electronIsDev) {
             console.log("Exiting in 5 seconds due to DB init failure...");
             await new Promise(resolve => setTimeout(resolve, 5000));
         }
         app.quit();
         return;
     }
     // *** END OF MOVED CODE ***

    await createWindow(); // Now safe to create window

    app.on('activate', async () => { // Make async
        // --- Add this console log ---
        console.log("--- App activated ---");
        // --- End of added log ---
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) {
            if (!db) { // Double check DB just in case
                console.error("DB not ready on activate, cannot create window.");
                return;
            }
            await createWindow(); // Await the async function
        }
    });
});

app.on('window-all-closed', () => {
   // --- Add this console log ---
   console.log("--- All windows closed ---");
   // --- End of added log ---
  // Quit when all windows are closed, except on macOS.
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
        await db.read();
        const images = db.data.images;
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

     await db.read();
     const existingPaths = new Set(db.data.images.map(image => image.path));
     const newImages = [];

     for (const filePath of result.filePaths) {
       if (!existingPaths.has(filePath)) {
         const newImage = {
           id: crypto.randomUUID(), // Generate unique ID
           path: filePath,
           description: '',
           last_updated: new Date().toISOString(),
         };
         db.data.images.push(newImage);
         newImages.push(newImage); // Collect only the newly added ones
          existingPaths.add(filePath); // Add to set to prevent duplicate additions in the same batch
         console.log(`Added new image: ${filePath}`);
       } else {
         console.log(`Skipped existing image: ${filePath}`);
       }
     }
     await db.write();

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
        await db.read();
        const image = db.data.images.find(img => img.id === id);

        if (image) {
            if (image.description !== description) { // Only write if changed
                image.description = description;
                image.last_updated = new Date().toISOString();
                await db.write();
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
        await db.read();
        const initialLength = db.data.images.length;
        db.data.images = db.data.images.filter(img => img.id !== imageId);

         if (db.data.images.length < initialLength) {
             await db.write();
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

