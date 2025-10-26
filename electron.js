// electron.js - Main Process
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path'); // Use node:path for clarity
const fs = require('node:fs').promises; // Use promises version of fs
const crypto = require('node:crypto');
// const electronIsDev = require('electron-is-dev'); // <--- Remove this line
const { JSONFile, Low } = require('lowdb'); // Use correct import style
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Added for Gemini

// --- Add this console log right at the beginning ---
console.log("--- Electron Main Process Starting ---");
// --- End of added log ---

// --- Dynamically import electron-is-dev ---
let electronIsDev;
async function loadElectronIsDev() {
    try {
        const module = await import('electron-is-dev');
        electronIsDev = module.default; // Assuming default export
        console.log("electron-is-dev loaded successfully.");
    } catch (err) {
        console.error("Failed to load electron-is-dev:", err);
        // Set a default value or handle the error appropriately
        electronIsDev = false; // Default to false if import fails
    }
}
const electronIsDevPromise = loadElectronIsDev();
// --- End dynamic import ---


// --- Database Setup ---
// Determine the path for the db.json file
// Use app.getPath('userData') which is designed for this purpose
const dbPath = path.join(app.getPath('userData'), 'db.json');
console.log(`Database path: ${dbPath}`); // Log the determined path

// Configure lowdb to use JSONFile adapter with the determined path
const adapter = new JSONFile(dbPath);

// Initialize LowDB instance asynchronously
let db;
async function initializeDb() {
    try {
        db = new Low(adapter);
        await db.read(); // Read data from file
        // Set default data if file doesn't exist or is empty
        db.data ||= { images: [] };
        await db.write(); // Write defaults if needed
        console.log("Database initialized successfully at:", dbPath);
        return db; // Return the initialized db instance
    } catch (error) {
         console.error("Failed to initialize database:", error);
         // Handle error appropriately - maybe show an error dialog to the user
         try {
             dialog.showErrorBox("Database Error", `Failed to initialize the database at ${dbPath}. Please check permissions or delete the file if corrupted. Error: ${error.message}`);
         } catch (dialogError) {
             console.error("Failed to show database error dialog:", dialogError);
         }
         app.quit(); // Exit if DB fails to load
         return null; // Return null if initialization failed
    }
}
// Call initializeDb early and store the promise
const dbInitializationPromise = initializeDb();


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
async function createWindow() { // Make createWindow async
   // --- Add this console log ---
   console.log("--- createWindow function called ---");
   // --- End of added log ---

    // Ensure electronIsDev is loaded before using it
    await electronIsDevPromise;
    if (typeof electronIsDev === 'undefined') {
        console.error("electron-is-dev could not be loaded. Defaulting to false.");
        electronIsDev = false; // Ensure it has a value
    }

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Recommended for security
      nodeIntegration: false, // Recommended for security
      // Allow loading local file URLs via blobs (though readFileAsBlob is better)
       // webSecurity: false, // TEMPORARY - Be cautious using this, consider readFileAsBlob
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
    mainWindow.webContents.openDevTools();
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
app.whenReady().then(async () => {
    // --- Add this console log ---
    console.log("--- App is ready ---");
    // --- End of added log ---

    // Ensure DB is initialized before creating window or setting up IPC handlers
    db = await dbInitializationPromise;
     if (!db) {
         console.error("Database failed to initialize. Exiting.");
         app.quit();
         return;
     }

    createWindow(); // Now calling an async function

    app.on('activate', () => {
        // --- Add this console log ---
        console.log("--- App activated ---");
        // --- End of added log ---
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow(); // Now calling an async function
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
         const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        console.log(`Successfully read ${arrayBuffer.byteLength} bytes for blob.`);
        return { success: true, data: arrayBuffer };
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return { success: false, error: error.message };
    }
});


// Load existing images from DB
ipcMain.handle('load-images', async () => {
    try {
         await dbInitializationPromise; // Ensure DB is ready
         if (!db) throw new Error("Database not initialized");
        await db.read(); // Re-read potentially updated data
        console.log("Sending images to frontend:", db.data.images.length);
        return { success: true, images: db.data.images };
    } catch (error) {
        console.error('Error loading images:', error);
        return { success: false, error: error.message };
    }
});

// Add new images
ipcMain.handle('add-images', async (event) => {
   try {
     await dbInitializationPromise; // Ensure DB is ready
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

     await db.read(); // Ensure we have the latest data before adding
     const existingPaths = new Set(db.data.images.map(img => img.path));
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

     if (newImages.length > 0) {
        await db.write(); // Save changes if new images were added
        console.log(`Saved ${newImages.length} new images to DB.`);
     }

     return { success: true, newImages: newImages };
   } catch (error) {
       console.error("Error adding images:", error);
       return { success: false, error: error.message };
   }
});


// Save description for an image
ipcMain.handle('save-description', async (event, { id, description }) => {
    try {
        await dbInitializationPromise; // Ensure DB is ready
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
ipcMain.handle('remove-image', async (event, imageId) => {
    try {
        await dbInitializationPromise; // Ensure DB is ready
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

