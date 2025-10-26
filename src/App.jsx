import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Bot, Edit2, Trash2, FolderOpen, Image as ImageIcon, Loader2 } from 'lucide-react';
// Removed 'path-browserify' import

// --- Helper Function ---
// Extracts filename from a path (cross-platform)
const getBasename = (filePath) => {
    if (!filePath || typeof filePath !== 'string') return '';
    // Replace backslashes with forward slashes for consistency
    const normalizedPath = filePath.replace(/\\/g, '/');
    // Find the last slash index
    const lastSlashIndex = normalizedPath.lastIndexOf('/');
    // Return the substring after the last slash, or the whole string if no slash
    return normalizedPath.substring(lastSlashIndex + 1);
};


// --- React Component ---
function App() {
  const [images, setImages] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, imageId: null, filePath: null });
  const [editingImageId, setEditingImageId] = useState(null);
  const [editDescription, setEditDescription] = useState('');
  const [loadingAI, setLoadingAI] = useState({}); // Track loading state per image
  const [notification, setNotification] = useState({ message: '', type: 'info', visible: false }); // type: info, success, error
  const contextMenuRef = useRef(null);
  const editInputRef = useRef(null);
  const [imageObjectURLs, setImageObjectURLs] = useState({}); // State for Blob URLs

  // --- Effects ---

   // Effect to create Blob URLs when images load or change
   useEffect(() => {
    const createURLs = async () => {
      const newURLs = {};
      const currentURLs = { ...imageObjectURLs }; // Copy existing URLs

      // Create new URLs for images that don't have one
      for (const image of images) {
        if (!currentURLs[image.id] && window.electronAPI?.readFileAsBlob) { // Check if API exists
          try {
            const blob = await window.electronAPI.readFileAsBlob(image.path);
            if (blob instanceof Blob) { // Verify it's a Blob
                currentURLs[image.id] = URL.createObjectURL(blob);
            } else {
                 console.warn(`Could not create blob for ${image.path}. Received:`, blob);
                 currentURLs[image.id] = `https://placehold.co/200x150/777/eee?text=Load+Error`; // Fallback placeholder
            }
          } catch (error) {
            console.error(`Error creating blob URL for ${image.path}:`, error);
            currentURLs[image.id] = `https://placehold.co/200x150/777/eee?text=Load+Error`; // Fallback on error
          }
        }
      }

       // Identify and revoke URLs for images that no longer exist in the `images` state
       const currentImageIds = new Set(images.map(img => img.id));
       const urlsToRevoke = [];
       for (const imageId in imageObjectURLs) {
           if (!currentImageIds.has(imageId)) {
               urlsToRevoke.push(imageObjectURLs[imageId]);
               delete currentURLs[imageId]; // Remove from state copy
           }
       }

       // Update state with new/existing URLs
       setImageObjectURLs(currentURLs);

       // Perform cleanup after state update
       urlsToRevoke.forEach(url => {
           // console.log("Revoking old URL:", url);
           if (url && url.startsWith('blob:')) { // Check if it's a blob URL before revoking
               URL.revokeObjectURL(url);
           }
       });
    };

    if (images.length > 0 && window.electronAPI?.readFileAsBlob) {
        createURLs();
    } else if (!window.electronAPI?.readFileAsBlob && images.length > 0) {
        // Handle case where API is not available (e.g., running in browser)
        const fallbackURLs = {};
        images.forEach(img => {
            fallbackURLs[img.id] = `https://placehold.co/200x150/555/eee?text=Electron+Only`;
        });
        setImageObjectURLs(fallbackURLs);
    }


    // Cleanup all remaining URLs when component unmounts
    return () => {
        // console.log("Unmounting App component, revoking all URLs");
        Object.values(imageObjectURLs).forEach(url => {
            if (url && url.startsWith('blob:')) { // Ensure it's a blob URL before revoking
                 // console.log("Revoking URL on unmount:", url);
                 URL.revokeObjectURL(url);
            }
        });
    };
     // Rerun when images array changes *identity*
  }, [images]); // Dependency array includes 'images'


  // Effect to load initial images from backend
  useEffect(() => {
    const loadData = async () => {
      if (window.electronAPI?.loadImages) {
        const result = await window.electronAPI.loadImages();
         if (result.success) {
           console.log("Loaded images:", result.images);
           setImages(result.images);
         } else {
            showNotification(`Error loading images: ${result.error}`, 'error');
         }
      } else {
        showNotification("Backend connection error. Add Images/AI features disabled.", "error", 5000);
        console.error("electronAPI is not available on window. Check preload script and contextIsolation settings.");
         setImages([]); // Start with empty if backend fails
      }
    };
    loadData();
  }, []); // Empty dependency array means run once on mount

  // Effect to handle clicking outside the context menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
        setContextMenu({ visible: false, x: 0, y: 0, imageId: null, filePath: null });
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

   // Effect to focus the edit input when editing starts
  useEffect(() => {
    if (editingImageId && editInputRef.current) {
      editInputRef.current.focus();
      // Move cursor to end
      editInputRef.current.selectionStart = editInputRef.current.value.length;
      editInputRef.current.selectionEnd = editInputRef.current.value.length;
    }
  }, [editingImageId]);

  // --- Handlers ---

  const showNotification = (message, type = 'info', duration = 3000) => {
    setNotification({ message, type, visible: true });
    // Auto-hide notification
    const timer = setTimeout(() => {
      setNotification(prev => ({ ...prev, visible: false }));
    }, duration);
    // Optional: Allow manual closing which would clear the timer
    // Store timer ID if manual close needs clearTimeout
  };

  const handleAddImages = async () => {
    if (window.electronAPI?.addImages) {
      const result = await window.electronAPI.addImages();
       if (result.success) {
           if (result.newImages.length > 0) {
              setImages(prevImages => [...prevImages, ...result.newImages]);
              showNotification(`Added ${result.newImages.length} new image(s).`, 'success');
           } else {
               showNotification('No new images selected or already added.', 'info');
           }
       } else {
            showNotification(`Failed to add images: ${result.error}`, 'error');
       }
    } else {
      showNotification("Cannot add images: Backend not available.", "error");
      console.error("electronAPI.addImages is not available on window.");
    }
  };

   const handleDescriptionChange = (id, newDescription) => {
    setImages(prevImages =>
      prevImages.map(img =>
        img.id === id ? { ...img, description: newDescription } : img
      )
    );
  };

  // Debounced save function
  const debouncedSave = useCallback(
    debounce(async (id, descriptionToSave) => {
      if (window.electronAPI?.saveDescription) {
        console.log(`Debounced save triggered for ${id}`);
        const result = await window.electronAPI.saveDescription({ id, description: descriptionToSave });
        if (result.success) {
          setImages(prevImages =>
            prevImages.map(img =>
              img.id === id ? { ...img, last_updated: new Date().toISOString() } : img
            )
          );
           // Maybe a very subtle save indicator instead of notification
        } else {
          showNotification(`Error saving description: ${result.error}`, 'error');
           // Revert UI? Requires fetching original description again
            const loadResult = await window.electronAPI.loadImages();
            if (loadResult.success) {
                const originalImage = loadResult.images.find(i => i.id === id);
                if (originalImage) {
                    handleDescriptionChange(id, originalImage.description);
                }
            }
        }
      } else {
        console.error("electronAPI.saveDescription is not available.");
      }
    }, 1000), // Save after 1 second of inactivity
    [] // Empty dependency array for useCallback
  );

  const handleDescriptionBlur = (id, currentDescription) => {
     // Trigger debounced save immediately on blur if needed, or rely on onChange debounce
     // For simplicity, let's rely on the debouncedSave from onChange
     // console.log("Blur event for", id);
      // You might want to cancel any pending debounce and save immediately on blur:
      // debouncedSave.flush(id, currentDescription);
  };

   const handleDescriptionChangeWithDebounce = (id, newDescription) => {
        handleDescriptionChange(id, newDescription); // Update UI immediately
        debouncedSave(id, newDescription); // Schedule save
   };


  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

   const handleContextMenu = (event, imageId, filePath) => {
    event.preventDefault();
     // Check if electronAPI is available before showing context menu options that need it
     if (!window.electronAPI) {
         showNotification("Backend features unavailable.", "error");
         return;
     }
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      imageId: imageId,
      filePath: filePath,
    });
     setEditingImageId(null); // Close any open editor
  };

  const handleEditDescription = () => {
    const imageToEdit = images.find(img => img.id === contextMenu.imageId);
    if (imageToEdit) {
      setEditingImageId(contextMenu.imageId);
      setEditDescription(imageToEdit.description);
    }
    setContextMenu({ visible: false, x: 0, y: 0, imageId: null, filePath: null }); // Close menu
  };

   const handleSaveEdit = async () => {
    if (editingImageId) {
       // Cancel any pending debounced save for this ID before manual save
       debouncedSave.cancel();

       handleDescriptionChange(editingImageId, editDescription); // Update UI immediately
       // Trigger the save logic immediately
       if (window.electronAPI?.saveDescription) {
            const result = await window.electronAPI.saveDescription({ id: editingImageId, description: editDescription });
             if (!result.success) {
                 showNotification(`Error saving description: ${result.error}`, 'error');
                  // Revert UI if save failed
                  const loadResult = await window.electronAPI.loadImages();
                 if (loadResult.success) {
                     const originalImage = loadResult.images.find(i => i.id === editingImageId);
                     if (originalImage) {
                         handleDescriptionChange(editingImageId, originalImage.description);
                     }
                 }
             } else {
                  setImages(prevImages =>
                     prevImages.map(img =>
                       img.id === editingImageId ? { ...img, last_updated: new Date().toISOString() } : img
                     )
                   );
             }
        }
      setEditingImageId(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingImageId(null);
     debouncedSave.cancel(); // Cancel any pending save if edit is cancelled
  };

  const handleEditInputChange = (event) => {
    setEditDescription(event.target.value);
  };

  const handleEditInputKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { // Save on Enter
        event.preventDefault();
        handleSaveEdit();
    } else if (event.key === 'Escape') { // Cancel on Escape
        handleCancelEdit();
    }
  };


  const handleDescribeWithAI = async () => {
    const imageId = contextMenu.imageId;
    const filePath = contextMenu.filePath;
    setContextMenu({ visible: false, x: 0, y: 0, imageId: null, filePath: null }); // Close menu

    if (!filePath || !imageId) return;

    if (window.electronAPI?.describeImage) {
      setLoadingAI(prev => ({ ...prev, [imageId]: true }));
      try {
        // Cancel pending debounced save before overwriting with AI
        debouncedSave.cancel();

        const result = await window.electronAPI.describeImage({ filePath, prompt: "Describe this image." });
        if (result.success) {
          handleDescriptionChange(imageId, result.description); // Update UI
           // Immediately save the AI description
           const saveResult = await window.electronAPI.saveDescription({ id: imageId, description: result.description });
            if (!saveResult.success) {
                 showNotification(`Error saving AI description: ${saveResult.error}`, 'error');
            } else {
                 setImages(prevImages =>
                    prevImages.map(img =>
                      img.id === imageId ? { ...img, last_updated: new Date().toISOString() } : img
                    )
                  );
                 showNotification("AI description generated and saved.", 'success');
            }
        } else {
          showNotification(result.error || 'Failed to get AI description.', 'error');
        }
      } catch (error) {
          showNotification(`Error calling AI: ${error.message}`, 'error');
          console.error("Error during describeImage IPC call:", error);
      } finally {
        setLoadingAI(prev => ({ ...prev, [imageId]: false }));
      }
    } else {
       showNotification("AI description feature not available.", "error");
      console.error("electronAPI.describeImage is not available.");
    }
  };

  const handleRemoveImage = async () => {
    const imageId = contextMenu.imageId;
     setContextMenu({ visible: false, x: 0, y: 0, imageId: null, filePath: null }); // Close menu
     if (!imageId) return;

    if (window.electronAPI?.removeImage) {
        const result = await window.electronAPI.removeImage(imageId);
         if (result.success) {
             const urlToRevoke = imageObjectURLs[imageId]; // Get URL before updating state
             setImages(prevImages => prevImages.filter(img => img.id !== imageId));
             // Clean up Blob URL *after* state update triggers useEffect cleanup is safer
             // Let the useEffect handle cleanup based on the changed `images` array.
             // if (urlToRevoke && urlToRevoke.startsWith('blob:')) {
             //    console.log("Revoking URL immediately on remove:", urlToRevoke);
             //    URL.revokeObjectURL(urlToRevoke);
             // }
             setImageObjectURLs(prev => {
                 const newURLs = {...prev};
                 delete newURLs[imageId];
                 return newURLs;
             });

            showNotification('Image removed from collection.', 'success');
         } else {
            showNotification(`Error removing image: ${result.error || 'Unknown error'}`, 'error');
         }
    } else {
         showNotification("Remove image feature not available.", "error");
        console.error("electronAPI.removeImage is not available.");
    }
  };

  const handleOpenFolder = () => {
      if(window.electronAPI?.openFolder && contextMenu.filePath) {
           try {
               // Use send for one-way as it doesn't need a response
              window.electronAPI.openFolder(contextMenu.filePath);
           } catch (error) {
                console.error("Error calling openFolder:", error);
                showNotification("Could not open folder.", "error");
           }
      } else {
           console.error("openFolder API or filePath missing.");
      }
      setContextMenu({ visible: false, x: 0, y: 0, imageId: null, filePath: null }); // Close menu
  };


  // --- Filtering ---
  const filteredImages = images.filter(image =>
    (image.description && image.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    // Use the helper function here
    (image.path && getBasename(image.path).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // --- Render ---
  return (
    <div className="flex h-screen bg-gray-900 text-gray-200 font-sans select-none"> {/* Added select-none */}
      {/* Sidebar */}
       <aside className="w-16 bg-gray-800 p-2 flex flex-col items-center space-y-4 flex-shrink-0">
            <div className="p-2 bg-indigo-600 rounded-lg text-white mt-2"> {/* Added margin-top */}
                <ImageIcon size={24} />
            </div>
             {/* Add other icons/navigation here if needed */}
        </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-gray-800 p-3 flex items-center justify-between shadow-md flex-shrink-0 border-b border-gray-700"> {/* Added border */}
          <div className="relative flex-grow max-w-lg mr-4"> {/* Increased max-width and added margin */}
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" /> {/* Adjusted color */}
            <input
              type="text"
              placeholder="Search by description or filename..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-gray-400" // Adjusted placeholder color
            />
          </div>
          <button
            onClick={handleAddImages}
            disabled={!window.electronAPI} // Disable if backend not available
            className={`px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition duration-150 ease-in-out ${!window.electronAPI ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            + Add Images
          </button>
        </header>

        {/* Image Grid */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"> {/* Adjusted scrollbar colors */}
          {images.length === 0 && !window.electronAPI && ( // Show backend error prominently if no images and no API
                <div className="flex flex-col items-center justify-center h-full text-red-400">
                  <X size={48} className="mb-4" />
                  <p className="text-lg font-semibold">Backend Connection Error</p>
                  <p>Could not connect to Electron features.</p>
                   <p>Ensure the app is running via Electron, not just in the browser.</p>
                </div>
           )}
           {images.length === 0 && window.electronAPI && ( // Show initial message if API is fine but no images
             <div className="flex flex-col items-center justify-center h-full text-gray-500">
               <ImageIcon size={48} className="mb-4" />
               <p>No images added yet.</p>
               <p>Click "+ Add Images" to get started.</p>
             </div>
           )}
           {filteredImages.length === 0 && images.length > 0 && ( // Show message if images exist but filter yields no results
               <div className="flex flex-col items-center justify-center h-full text-gray-500">
                   <Search size={48} className="mb-4" />
                   <p>No images match your search term "{searchTerm}".</p>
               </div>
           )}
          {filteredImages.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredImages.map((image) => (
                <div
                  key={image.id}
                  className="relative group bg-gray-800 rounded-lg overflow-hidden shadow-lg border border-gray-700/50 flex flex-col aspect-[4/3]" // Adjusted aspect ratio
                  onContextMenu={(e) => handleContextMenu(e, image.id, image.path)}
                  style={{ minHeight: '180px' }} // Ensure a minimum height
                >
                  <div className="flex-grow relative" style={{ minHeight: '100px'}}> {/* Ensure image container can grow */}
                      <img
                        src={imageObjectURLs[image.id] || `https://placehold.co/200x150/777/eee?text=Loading...`} // Use placeholder while loading
                        // Use the helper function here
                        alt={image.path ? getBasename(image.path) : 'Image'}
                        className="absolute inset-0 w-full h-full object-cover bg-gray-700" // Use absolute positioning
                        // onError handled by placeholder in src
                       />
                   </div>

                  {/* Description Textarea & Filename */}
                   <div className="p-2 flex-shrink-0 flex flex-col" style={{ minHeight: '60px' }}> {/* Fixed height for text area */}
                     {editingImageId === image.id ? (
                      <textarea
                        ref={editInputRef}
                        value={editDescription}
                        onChange={handleEditInputChange}
                        onKeyDown={handleEditInputKeyDown}
                        onBlur={handleSaveEdit}
                        className="w-full bg-gray-600 border border-indigo-500 rounded-md p-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-600 mb-1" // Adjusted padding and margin
                        placeholder="Editing description..."
                        rows={2} // Reduced rows
                      />
                     ) : (
                        <textarea
                          value={image.description}
                           onChange={(e) => handleDescriptionChangeWithDebounce(image.id, e.target.value)} // Use debounced handler
                           onBlur={(e) => handleDescriptionBlur(image.id, e.target.value)}
                          className="w-full bg-gray-700 border border-gray-600 rounded-md p-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-700 placeholder-gray-400 mb-1" // Adjusted padding and margin
                          placeholder="Add description..."
                          rows={2} // Reduced rows
                          readOnly={loadingAI[image.id]}
                        />
                     )}
                     {/* Display Filename */}
                      <span className="text-xs text-gray-400 truncate self-start" title={getBasename(image.path)}>
                          {getBasename(image.path)}
                      </span>
                   </div>

                    {/* Loading Indicator */}
                    {loadingAI[image.id] && (
                        <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center text-white text-xs z-10 rounded-lg">
                            <Loader2 size={24} className="animate-spin mb-1" />
                            <span>Generating AI...</span> {/* Shorter text */}
                        </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Context Menu */}
        {contextMenu.visible && (
          <div
            ref={contextMenuRef}
            style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }} // Use style for positioning
            className="absolute bg-gray-700 border border-gray-600 rounded-md shadow-lg py-1 z-50 text-sm min-w-[180px]" // Added min-width
          >
            <button onClick={handleDescribeWithAI} className="w-full flex items-center px-4 py-2 hover:bg-indigo-600 hover:text-white transition duration-150 ease-in-out text-left">
              <Bot size={16} className="mr-2 flex-shrink-0" /> Describe with AI
            </button>
            <button onClick={handleEditDescription} className="w-full flex items-center px-4 py-2 hover:bg-indigo-600 hover:text-white transition duration-150 ease-in-out text-left">
              <Edit2 size={16} className="mr-2 flex-shrink-0" /> Edit Description
            </button>
              {window.electronAPI?.openFolder && contextMenu.filePath &&
                 <button onClick={handleOpenFolder} className="w-full flex items-center px-4 py-2 hover:bg-indigo-600 hover:text-white transition duration-150 ease-in-out text-left">
                  <FolderOpen size={16} className="mr-2 flex-shrink-0" /> Open Folder
                 </button>
              }
            <div className="border-t border-gray-600 my-1"></div>
            <button onClick={handleRemoveImage} className="w-full flex items-center px-4 py-2 text-red-400 hover:bg-red-600 hover:text-white transition duration-150 ease-in-out text-left">
              <Trash2 size={16} className="mr-2 flex-shrink-0" /> Remove from Collection
            </button>
          </div>
        )}

         {/* Notification Area */}
         {notification.visible && (
          <div className={`fixed bottom-4 right-4 p-3 rounded-lg shadow-xl text-sm z-[100] flex items-center max-w-sm // Increased shadow and z-index
             ${notification.type === 'success' ? 'bg-green-600 text-white' : ''}
             ${notification.type === 'error' ? 'bg-red-600 text-white' : ''}
             ${notification.type === 'info' ? 'bg-blue-600 text-white' : ''}
          `}>
             <span className="flex-grow mr-2">{notification.message}</span>
             <button onClick={() => setNotification(prev => ({ ...prev, visible: false }))} className="ml-auto text-xl font-semibold leading-none flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/20">&times;</button>
          </div>
        )}
      </main>
    </div>
  );
}

// Simple debounce function
function debounce(func, wait) {
  let timeout;
  const debounced = function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        timeout = null; // Clear timeout ID after execution
        func.apply(context, args);
    }, wait);
  };
   // Add a cancel method
  debounced.cancel = function() {
    clearTimeout(timeout);
    timeout = null;
  };
   // Add a flush method (optional, useful for blur/save)
   debounced.flush = function(...args) {
       clearTimeout(timeout);
       timeout = null;
       func.apply(this, args);
   }

  return debounced;
}


export default App;
