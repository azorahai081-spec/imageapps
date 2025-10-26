import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Bot, Edit2, Trash2, FolderOpen, Image as ImageIcon, Loader2, Tag, CheckSquare, Square, RefreshCcw, ZoomIn, SlidersHorizontal, File as FileIcon, Folder as FolderIcon, Settings } from 'lucide-react';
import SettingsModal from './Settings'; // <-- Import the new component

// --- Helper Functions ---
const getBasename = (filePath) => {
    if (!filePath || typeof filePath !== 'string') return '';
    // Use path.basename directly if path module is available (e.g., in Node/Electron main)
    // For renderer/preload or browser, use string manipulation
    try {
        // Attempt to use path if available (might fail in strict browser environments)
        // This check might be overly optimistic depending on the build setup
        if (typeof require === 'function') {
            const path = require('path');
             if (path && path.basename) return path.basename(filePath);
        }
    } catch (e) {
        // Fallback if require or path module fails
        // console.warn("Path module not available in getBasename, using fallback.");
    }
    // Fallback string manipulation
    const normalizedPath = filePath.replace(/\\/g, '/');
    const lastSlashIndex = normalizedPath.lastIndexOf('/');
    return normalizedPath.substring(lastSlashIndex + 1);
};
// Debounce function
function debounce(func, wait) {
  let timeout;
  const debounced = function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        timeout = null;
        func.apply(context, args);
    }, wait);
  };
  debounced.cancel = function() {
    clearTimeout(timeout);
    timeout = null;
  };
   debounced.flush = function(...args) {
       clearTimeout(timeout);
       timeout = null;
       func.apply(this, args);
   }
  return debounced;
}

// --- Constants ---
const DEFAULT_PROMPT_KEY = 'basic';
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 10;
const DEFAULT_COLUMNS = 6;
// Get API Key placeholder - In a real app, manage this securely, maybe via main process
const GEMINI_API_KEY = "AIzaSyAOshiEgqwGdqyR4A2q0KxwJSj13Flw7d4"; // Keep this aligned with electron.js
const isAiConfigured = () => typeof GEMINI_API_KEY === 'string' && GEMINI_API_KEY.length > 0;

// --- React Component ---
function App() {
  const [images, setImages] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTagFilter, setActiveTagFilter] = useState(null); // State for tag filtering
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, imageId: null, filePath: null, promptKey: DEFAULT_PROMPT_KEY });
  const [editingDescId, setEditingDescId] = useState(null);
  const [editDescription, setEditDescription] = useState('');
  const [editingTagsId, setEditingTagsId] = useState(null);
  const [currentTagsInput, setCurrentTagsInput] = useState('');
  const [loadingAI, setLoadingAI] = useState({});
  const [notification, setNotification] = useState({ message: '', type: 'info', visible: false });
  const contextMenuRef = useRef(null);
  const editInputRef = useRef(null);
  const tagInputRef = useRef(null);
  const [imageObjectURLs, setImageObjectURLs] = useState({});
  const [selectedImageIds, setSelectedImageIds] = useState(new Set());
  const [gridColumns, setGridColumns] = useState(DEFAULT_COLUMNS); // State for thumbnail size (via columns)
  const [previewImage, setPreviewImage] = useState(null); // State for image preview modal { src, alt }
  const [aiPrompts, setAiPrompts] = useState({}); // State for predefined AI prompts
  const [isLoading, setIsLoading] = useState(false); // General loading state for refresh
  const [isSettingsVisible, setIsSettingsVisible] = useState(false); // <-- State for settings modal

  // --- Grid Column Class Calculation ---
  const getGridColsClass = (cols) => {
      const classMap = {
          2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5',
          6: 'grid-cols-6', 7: 'grid-cols-7', 8: 'grid-cols-8', 9: 'grid-cols-9', 10: 'grid-cols-10'
      };
      return classMap[cols] || 'grid-cols-6'; // Default fallback
  };


  // --- Effects ---
  // Effect to create/revoke Blob URLs
  useEffect(() => {
    const createURLs = async () => {
        const currentURLs = { ...imageObjectURLs };
        const urlsToRevoke = [];
        const currentImageIds = new Set(images.map(img => img.id));

        // Create new URLs
        for (const image of images) {
            if (!currentURLs[image.id] && image.path && window.electronAPI?.readFileAsBlob) { // Check image.path exists
                try {
                    const blob = await window.electronAPI.readFileAsBlob(image.path);
                    if (blob instanceof Blob) {
                        currentURLs[image.id] = URL.createObjectURL(blob);
                    } else {
                        console.warn(`Could not create blob for ${image.path}. Received:`, blob);
                        currentURLs[image.id] = `https://placehold.co/200x150/777/eee?text=Load+Error`;
                    }
                } catch (error) {
                    console.error(`Error creating blob URL for ${image.path}:`, error);
                    currentURLs[image.id] = `https://placehold.co/200x150/777/eee?text=Load+Error`;
                }
            } else if (!window.electronAPI?.readFileAsBlob && !currentURLs[image.id]) {
                 currentURLs[image.id] = `https://placehold.co/200x150/555/eee?text=Electron+Only`;
            }
        }

        // Identify URLs to revoke
        for (const imageId in imageObjectURLs) {
            if (!currentImageIds.has(imageId)) {
                urlsToRevoke.push(imageObjectURLs[imageId]);
                delete currentURLs[imageId]; // Remove from state copy
            }
        }

        setImageObjectURLs(currentURLs);

        // Revoke old URLs
        urlsToRevoke.forEach(url => {
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        });
    };

    if (images.length > 0) {
        createURLs();
    } else {
        // Clear all URLs if images array is empty
        Object.values(imageObjectURLs).forEach(url => {
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        });
        setImageObjectURLs({});
    }

    // Cleanup on unmount
    return () => {
        Object.values(imageObjectURLs).forEach(url => {
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        });
    };
  }, [images]); // Rerun when images array changes

  // Load initial data and AI prompts
  useEffect(() => {
    const loadInitialData = async () => {
        setIsLoading(true);
        let connectionError = false; // Flag connection error

        if (window.electronAPI?.loadImages) {
            try {
                const result = await window.electronAPI.loadImages();
                if (result.success) {
                    const imagesWithTags = result.images.map(img => ({
                        ...img,
                        tags: Array.isArray(img.tags) ? img.tags : [],
                        // Use helper for folder name
                        folderName: img.folderName || (img.path ? getBasename(img.path.substring(0, img.path.lastIndexOf('/'))) : 'Unknown') // Using fallback getBasename logic implicitly
                    }));
                    setImages(imagesWithTags);
                } else {
                    showNotification(`Error loading images: ${result.error}`, 'error');
                    setImages([]);
                    connectionError = true; // Assume connection error if load fails
                }
            } catch (error) {
                 showNotification(`Error loading images: ${error.message}`, 'error');
                 setImages([]);
                 connectionError = true;
            }
        } else {
            showNotification("Backend connection error. Add Images/AI features disabled.", "error", 5000);
            setImages([]);
            connectionError = true;
        }

        // Fetch AI prompts only if connection seems okay
        if (!connectionError && window.electronAPI?.getAIPrompts) {
             try {
                const promptResult = await window.electronAPI.getAIPrompts();
                 if (promptResult.success) {
                     setAiPrompts(promptResult.prompts || {});
                 } else {
                     console.error("Failed to load AI prompts:", promptResult.error);
                     setAiPrompts({ [DEFAULT_PROMPT_KEY]: "Describe this image concisely." }); // Fallback
                 }
             } catch (error) {
                  console.error("Failed to load AI prompts:", error.message);
                  setAiPrompts({ [DEFAULT_PROMPT_KEY]: "Describe this image concisely." }); // Fallback
             }
        } else if (!connectionError) {
             // If no connection error but getAIPrompts is missing, set fallback
             setAiPrompts({ [DEFAULT_PROMPT_KEY]: "Describe this image concisely." }); // Fallback
        }

        setIsLoading(false);
    };
    loadInitialData();
  }, []); // Run once on mount

  // Click outside context menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Also close if clicking outside the tag input or description input while editing
      if (
          (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) &&
          (!tagInputRef.current || !tagInputRef.current.contains(event.target)) &&
          (!editInputRef.current || !editInputRef.current.contains(event.target))
         )
      {
        hideContextMenu();
        // Check if editing tags and save on blur
        if (editingTagsId && tagInputRef.current && !tagInputRef.current.contains(event.target)) {
            handleTagInputBlur(editingTagsId);
        }
        // Check if editing description and save on blur
        if (editingDescId && editInputRef.current && !editInputRef.current.contains(event.target)) {
             handleSaveDescEdit();
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingTagsId, editingDescId, currentTagsInput]); // Add dependencies

  // Focus description edit input
  useEffect(() => {
    if (editingDescId && editInputRef.current) {
      editInputRef.current.focus();
      // Set cursor to end
      const val = editInputRef.current.value;
      editInputRef.current.value = '';
      editInputRef.current.value = val;
      editInputRef.current.scrollTop = editInputRef.current.scrollHeight; // Scroll to bottom if needed
    }
  }, [editingDescId]);

  // Focus tag edit input
  useEffect(() => {
    if (editingTagsId && tagInputRef.current) {
        tagInputRef.current.focus();
    }
  }, [editingTagsId]);

   // --- Data Loading Function (for Refresh) ---
  const loadData = async () => {
        setIsLoading(true);
        hideContextMenu();
        setSelectedImageIds(new Set()); // Deselect on refresh
        if (window.electronAPI?.loadImages) {
            try {
                const result = await window.electronAPI.loadImages();
                if (result.success) {
                    const imagesWithTags = result.images.map(img => ({
                         ...img,
                         tags: Array.isArray(img.tags) ? img.tags : [],
                         folderName: img.folderName || (img.path ? getBasename(img.path.substring(0, img.path.lastIndexOf('/'))) : 'Unknown') // Recalculate if needed
                     }));
                    setImages(imagesWithTags);
                     showNotification("Image list refreshed.", "success", 1500);
                } else {
                    showNotification(`Error loading images: ${result.error}`, 'error');
                }
            } catch (error) {
                showNotification(`Error loading images: ${error.message}`, 'error');
            }
        } else {
             showNotification("Backend connection error.", "error", 5000);
        }
        setIsLoading(false);
    };


  // --- Handlers ---
  const showNotification = (message, type = 'info', duration = 3000) => {
    setNotification({ message, type, visible: true });
    setTimeout(() => {
      setNotification(prev => ({ ...prev, visible: false }));
    }, duration);
  };

  // --- NEW: Add *Files* Handler ---
  const handleAddFiles = async () => {
    if (!window.electronAPI?.addImageFiles) {
        showNotification("Cannot add files: Backend not available.", "error");
        return;
    }
    const result = await window.electronAPI.addImageFiles();
    if (result.success) {
        if (result.newImages.length > 0) {
            const imagesWithTags = result.newImages.map(img => ({ ...img, tags: Array.isArray(img.tags) ? img.tags : [] }));
            setImages(prevImages => [...prevImages, ...imagesWithTags]);
            showNotification(`Added ${result.newImages.length} new image(s).`, 'success');
        } else {
            showNotification('No new images selected or already added.', 'info');
        }
    } else {
        showNotification(`Failed to add images: ${result.error}`, 'error');
    }
  };

  // --- NEW: Add *Folders* Handler ---
  const handleAddFolders = async () => {
    if (!window.electronAPI?.addImageFolders) {
        showNotification("Cannot add folders: Backend not available.", "error");
        return;
    }
    const result = await window.electronAPI.addImageFolders();
    if (result.success) {
        if (result.newImages.length > 0) {
            const imagesWithTags = result.newImages.map(img => ({ ...img, tags: Array.isArray(img.tags) ? img.tags : [] }));
            setImages(prevImages => [...prevImages, ...imagesWithTags]);
            showNotification(`Added ${result.newImages.length} new image(s) from folder(s).`, 'success');
        } else {
            showNotification('No new images found in selected folder(s) or already added.', 'info');
        }
    } else {
        showNotification(`Failed to add folders: ${result.error}`, 'error');
    }
  };

  const handleDescriptionChange = (id, newDescription) => {
    setImages(prevImages =>
      prevImages.map(img =>
        img.id === id ? { ...img, description: newDescription } : img
      )
    );
  };
  const debouncedSaveDescription = useCallback(debounce(async (id, descriptionToSave) => {
      if (window.electronAPI?.saveDescription) {
        console.log(`Debounced description save triggered for ${id}`);
        const result = await window.electronAPI.saveDescription({ id, description: descriptionToSave });
        if (result.success) {
          setImages(prevImages =>
            prevImages.map(img =>
              img.id === id ? { ...img, last_updated: new Date().toISOString() } : img
            )
          );
        } else {
          showNotification(`Error saving description: ${result.error}`, 'error');
           // Revert UI on failure
            const loadResult = await window.electronAPI.loadImages();
            if (loadResult.success) {
                const originalImage = loadResult.images.find(i => i.id === id);
                if (originalImage) {
                    handleDescriptionChange(id, originalImage.description);
                }
            }
        }
      }
    }, 1000), []);
  const handleDescriptionChangeWithDebounce = (id, newDescription) => {
    handleDescriptionChange(id, newDescription);
    debouncedSaveDescription(id, newDescription);
  };

  // Tag handling
  const handleTagChange = (id, newTags) => {
    setImages(prevImages =>
        prevImages.map(img =>
            img.id === id ? { ...img, tags: newTags } : img
        )
    );
  };
  const handleSaveTags = async (id, tagsToSave) => {
        // Ensure tagsToSave is an array
        const newTags = Array.isArray(tagsToSave) ? tagsToSave :
                        String(tagsToSave).split(',')
                         .map(tag => tag.trim().toLowerCase())
                         .filter((tag, index, self) => tag !== '' && self.indexOf(tag) === index);

        if (window.electronAPI?.saveTags) {
            console.log(`Saving tags for ${id}:`, newTags);
            const result = await window.electronAPI.saveTags({ id, tags: newTags });
            if (result.success) {
                setImages(prevImages =>
                    prevImages.map(img =>
                        img.id === id ? { ...img, tags: newTags, last_updated: new Date().toISOString() } : img // Ensure UI state matches saved state
                    )
                );
            } else {
                showNotification(`Error saving tags: ${result.error}`, 'error');
                 const loadResult = await window.electronAPI.loadImages();
                 if (loadResult.success) {
                    const originalImage = loadResult.images.find(i => i.id === id);
                    if (originalImage) {
                         handleTagChange(id, originalImage.tags || []);
                    }
                 }
            }
        }
        setEditingTagsId(null); // Close tag editor
        setCurrentTagsInput('');
    };
  const handleStartEditingTags = (id) => {
        const image = images.find(img => img.id === id);
        if (image) {
            setEditingTagsId(id);
            setCurrentTagsInput((image.tags || []).join(', '));
        }
        setEditingDescId(null);
        hideContextMenu();
    };
  const handleTagInputKeyDown = (event, id) => { // Removed currentTagsArray as it can be derived from state
        if (event.key === 'Enter') {
            event.preventDefault();
            const newTags = currentTagsInput.split(',')
                                         .map(tag => tag.trim().toLowerCase()) // Standardize to lowercase
                                         .filter((tag, index, self) => tag !== '' && self.indexOf(tag) === index); // Filter empty and duplicates
            handleSaveTags(id, newTags); // Save tags (which also updates UI state and closes editor)
        } else if (event.key === 'Escape') {
            setEditingTagsId(null);
            setCurrentTagsInput('');
        }
    };
  const handleTagInputBlur = (id) => { // Save on blur
        const newTags = currentTagsInput.split(',')
                                     .map(tag => tag.trim().toLowerCase())
                                     .filter((tag, index, self) => tag !== '' && self.indexOf(tag) === index);
        if (editingTagsId === id) { // Only save if this input was the one being edited
            handleSaveTags(id, newTags); // Save tags (which also updates UI state and closes editor)
        }
   };
  const handleRemoveTag = (imageId, tagToRemove) => {
         const image = images.find(img => img.id === imageId);
         if (image) {
             const updatedTags = (image.tags || []).filter(tag => tag !== tagToRemove);
             handleSaveTags(imageId, updatedTags); // Save changes (which also updates UI)
         }
     };

  // Search
  const handleSearchChange = (event) => { setSearchTerm(event.target.value); setActiveTagFilter(null); };

  // Context Menu
  const hideContextMenu = () => { setContextMenu(prev => ({ ...prev, visible: false })); };
  const handleContextMenu = (event, imageId, filePath) => {
    event.preventDefault();
    event.stopPropagation();
     if (!window.electronAPI) { showNotification("Backend features unavailable.", "error"); return; }
    // Reset prompt key to default when opening menu
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, imageId: imageId, filePath: filePath, promptKey: DEFAULT_PROMPT_KEY });
    setEditingDescId(null); setEditingTagsId(null);
  };

  // Description Editing
  const handleEditDescription = () => {
    const imageToEdit = images.find(img => img.id === contextMenu.imageId);
    if (imageToEdit) {
      setEditingDescId(contextMenu.imageId);
      setEditDescription(imageToEdit.description);
      setEditingTagsId(null);
    }
    hideContextMenu();
  };
  const handleSaveDescEdit = async () => {
    if (editingDescId) {
       debouncedSaveDescription.cancel();
       // Optimistically update UI first
       handleDescriptionChange(editingDescId, editDescription);
       const idToSave = editingDescId; // Store ID before clearing
       const descToSave = editDescription;
       setEditingDescId(null); // Close editor

       if (window.electronAPI?.saveDescription) {
            const result = await window.electronAPI.saveDescription({ id: idToSave, description: descToSave });
             if (!result.success) {
                 showNotification(`Error saving description: ${result.error}`, 'error');
                 const loadResult = await window.electronAPI.loadImages();
                 if (loadResult.success) {
                     const originalImage = loadResult.images.find(i => i.id === idToSave);
                     if (originalImage) {
                         handleDescriptionChange(idToSave, originalImage.description); // Revert
                     }
                 }
             } else {
                  setImages(prevImages =>
                     prevImages.map(img =>
                       img.id === idToSave ? { ...img, last_updated: new Date().toISOString() } : img
                     )
                   );
             }
        }
    }
  };
  const handleCancelDescEdit = () => {
    setEditingDescId(null);
    debouncedSaveDescription.cancel();
  };
  const handleEditInputChange = (event) => {
    setEditDescription(event.target.value);
  };
  const handleEditInputKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSaveDescEdit();
    } else if (event.key === 'Escape') {
        handleCancelDescEdit();
    }
  };

  // --- AI Description (Single) ---
  const handleDescribeWithAI = async (imageId, filePath, promptKey = DEFAULT_PROMPT_KEY) => {
      hideContextMenu();
      const prompt = aiPrompts[promptKey] || aiPrompts[DEFAULT_PROMPT_KEY];
      if (!filePath || !imageId || !prompt || !window.electronAPI?.describeImage) { showNotification("AI feature unavailable or image data missing.", "error"); return; }
      if (!isAiConfigured()) { showNotification("AI Error: Gemini API key not configured.", "error"); return; }

      setLoadingAI(prev => ({ ...prev, [imageId]: true }));
      try {
        debouncedSaveDescription.cancel();
        const result = await window.electronAPI.describeImage({ filePath, prompt });
        if (result.success) {
          handleDescriptionChange(imageId, result.description); // Update UI
          const saveResult = await window.electronAPI.saveDescription({ id: imageId, description: result.description }); // Save
          if (!saveResult.success) { showNotification(`Error saving AI description: ${saveResult.error}`, 'error'); }
          else {
              setImages(prev => prev.map(img => img.id === imageId ? { ...img, last_updated: new Date().toISOString() } : img));
              showNotification("AI description generated and saved.", 'success');
          }
        } else { showNotification(result.error || 'Failed to get AI description.', 'error'); }
      } catch (error) { showNotification(`Error calling AI: ${error.message}`, 'error'); }
      finally { setLoadingAI(prev => ({ ...prev, [imageId]: false })); }
  };

  // --- Bulk AI Description ---
  const handleDescribeSelectedWithAI = async (promptKey = DEFAULT_PROMPT_KEY) => {
        hideContextMenu();
        const prompt = aiPrompts[promptKey] || aiPrompts[DEFAULT_PROMPT_KEY];
        const selectedImages = images.filter(img => selectedImageIds.has(img.id));
        if (selectedImages.length === 0 || !prompt || !window.electronAPI?.describeImage) { showNotification("No images selected or AI feature unavailable.", "info"); return; }
        if (!isAiConfigured()) { showNotification("AI Error: Gemini API key not configured.", "error"); return; }

        showNotification(`Starting AI description (${promptKey}) for ${selectedImages.length} image(s)...`, "info", 5000);
        const processingIds = selectedImages.map(img => img.id);
        setLoadingAI(prev => ({ ...prev, ...Object.fromEntries(processingIds.map(id => [id, true])) }));
        let successCount = 0; let errorCount = 0;
        let updatedImages = [...images]; // Create a mutable copy

        for (const image of selectedImages) {
            try {
                debouncedSaveDescription.cancel(); // Cancel for this image
                const result = await window.electronAPI.describeImage({ filePath: image.path, prompt });
                if (result.success) {
                    const index = updatedImages.findIndex(img => img.id === image.id);
                    if (index !== -1) {
                         updatedImages[index] = { ...updatedImages[index], description: result.description, last_updated: new Date().toISOString() };
                    }
                    await window.electronAPI.saveDescription({ id: image.id, description: result.description });
                    successCount++;
                } else {
                    console.error(`AI failed for ${image.path}: ${result.error}`); errorCount++;
                }
            } catch (error) { console.error(`AI failed for ${image.path}: ${error.message}`); errorCount++; }
            finally { setLoadingAI(prev => ({ ...prev, [image.id]: false })); }
        }
        setImages(updatedImages); // Update state once
        showNotification(`AI description finished. Success: ${successCount}, Errors: ${errorCount}.`, errorCount > 0 ? 'error' : 'success', 5000);
        setSelectedImageIds(new Set());
  };

  // --- Remove handlers (Single/Bulk) ---
  const handleRemoveImage = async (imageId) => {
     hideContextMenu();
     if (!imageId || !window.electronAPI?.removeImagesBulk) return;
    const result = await window.electronAPI.removeImagesBulk([imageId]);
     if (result.success && result.removedCount > 0) {
         setImages(prevImages => prevImages.filter(img => img.id !== imageId));
         setSelectedImageIds(prev => {
             const newSet = new Set(prev);
             newSet.delete(imageId);
             return newSet;
         });
         showNotification('Image removed from collection.', 'success');
     } else {
        showNotification(`Error removing image: ${result.error || 'Unknown error'}`, 'error');
     }
  };
  const handleRemoveSelected = async () => {
        hideContextMenu();
        const idsToRemove = Array.from(selectedImageIds);
        if (idsToRemove.length === 0 || !window.electronAPI?.removeImagesBulk) {
            showNotification("No images selected or remove feature unavailable.", "info");
            return;
        }
         showNotification(`Removing ${idsToRemove.length} image(s)...`, "info");
        const result = await window.electronAPI.removeImagesBulk(idsToRemove);
        if (result.success) {
            setImages(prevImages => prevImages.filter(img => !selectedImageIds.has(img.id)));
             showNotification(`Removed ${result.removedCount} image(s).`, 'success');
        } else {
             showNotification(`Error removing images: ${result.error || 'Unknown error'}. Removed ${result.removedCount}.`, 'error', 5000);
             if (result.removedCount > 0) {
                 setImages(prevImages => prevImages.filter(img => !selectedImageIds.has(img.id)));
             }
        }
        setSelectedImageIds(new Set());
  };
  // --- Open Folder handler ---
  const handleOpenFolder = () => {
      if(window.electronAPI?.openFolder && contextMenu.filePath) {
           try {
              window.electronAPI.openFolder(contextMenu.filePath);
           } catch (error) {
                console.error("Error calling openFolder:", error);
                showNotification("Could not open folder.", "error");
           }
      } else {
           console.error("openFolder API or filePath missing.");
      }
      hideContextMenu();
  };
  // --- Selection handlers ---
  const handleImageClick = (imageId, event) => {
      if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT' || event.target.closest('.tag-item')) {
          return;
      }
      setSelectedImageIds(prevSelectedIds => {
          const newSelectedIds = new Set(prevSelectedIds);
          if (newSelectedIds.has(imageId)) {
              newSelectedIds.delete(imageId);
          } else {
              newSelectedIds.add(imageId);
          }
          console.log("Selected IDs:", newSelectedIds);
          return newSelectedIds;
      });
      setEditingDescId(null);
      setEditingTagsId(null);
  };
  const handleSelectAll = () => {
      setSelectedImageIds(new Set(filteredImages.map(img => img.id)));
  };
  const handleDeselectAll = () => {
      setSelectedImageIds(new Set());
  };

  // --- Preview Modal Handlers ---
  const openPreview = (src, alt) => { setPreviewImage({ src, alt }); };
  const closePreview = () => { setPreviewImage(null); };

  // --- Tag Filter Handler ---
  const handleTagFilterClick = (tag) => {
       setActiveTagFilter(prevFilter => (prevFilter === tag ? null : tag));
       setSearchTerm('');
   };

  // --- NEW: Settings Modal Handlers ---
  const handleSavePrompts = async (newPrompts) => {
    if (window.electronAPI?.saveAIPrompts) {
      const result = await window.electronAPI.saveAIPrompts(newPrompts);
      if (result.success) {
        setAiPrompts(newPrompts); // Update state
        showNotification("AI prompts saved successfully!", 'success');
        setIsSettingsVisible(false); // Close modal
      } else {
        showNotification(`Error saving prompts: ${result.error}`, 'error');
      }
    }
  };


  // --- Filtering ---
  const filteredImages = images.filter(image => {
        if (activeTagFilter && (!image.tags || !image.tags.includes(activeTagFilter))) {
            return false;
        }
        const searchTermLower = searchTerm.toLowerCase();
        if (searchTermLower === '') return true;
        return (
            (image.description && image.description.toLowerCase().includes(searchTermLower)) ||
            (image.path && getBasename(image.path).toLowerCase().includes(searchTermLower)) ||
            (image.tags && image.tags.some(tag => tag.toLowerCase().includes(searchTermLower)))
        );
   });
  const uniqueTags = [...new Set(images.flatMap(img => img.tags || []))].sort();

  // --- Render ---
  return (
    <div className="flex h-screen bg-gray-900 text-gray-200 font-sans select-none">
      {/* Sidebar */}
       <aside className="w-16 bg-gray-800 p-2 flex flex-col items-center space-y-4 flex-shrink-0">
            <div className="p-2 bg-indigo-600 rounded-lg text-white mt-2">
                <ImageIcon size={24} />
            </div>
        </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-gray-800 p-3 flex items-center justify-between shadow-md flex-shrink-0 border-b border-gray-700 space-x-4">
          <div className="relative flex-grow max-w-lg"> {/* Search */}
             <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search descriptions, filenames, tags..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-gray-400"
            />
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0"> {/* Buttons & Controls */}
              {/* Thumbnail Size Slider */}
             <div className="flex items-center space-x-2 mr-2" title={`Grid Columns: ${gridColumns}`}>
                  <SlidersHorizontal size={16} className="text-gray-400"/>
                  <input
                      type="range"
                      min={MIN_COLUMNS}
                      max={MAX_COLUMNS}
                      step="1"
                      value={gridColumns}
                      onChange={(e) => setGridColumns(Number(e.target.value))}
                      className="w-20 md:w-24 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer range-sm accent-indigo-500"
                  />
              </div>
             {/* Selection Controls */}
             {selectedImageIds.size > 0 ? (
                 <>
                      <span className="text-sm text-gray-400">{selectedImageIds.size} selected</span>
                     <button onClick={handleDeselectAll} className="p-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-xs font-medium transition" title="Deselect All">
                         <Square size={16} />
                     </button>
                 </>
             ) : (
                filteredImages.length > 0 && (
                     <button onClick={handleSelectAll} className="p-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-xs font-medium transition" title={`Select All ${filteredImages.length} Visible`}>
                          <CheckSquare size={16} />
                     </button>
                )
             )}
             {/* Refresh Button */}
             <button
                onClick={loadData}
                disabled={isLoading}
                className={`p-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-xs font-medium transition ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
                title="Refresh Image List"
             >
                  {isLoading ? <Loader2 size={16} className="animate-spin"/> : <RefreshCcw size={16} />}
              </button>
             {/* --- MODIFIED: Add Buttons --- */}
             <button
                onClick={handleAddFiles}
                disabled={!window.electronAPI}
                className={`px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition duration-150 ease-in-out flex items-center space-x-1.5 ${!window.electronAPI ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Add individual image files"
              >
                <FileIcon size={14} />
                <span>Files</span>
              </button>
              <button
                onClick={handleAddFolders}
                disabled={!window.electronAPI}
                className={`px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition duration-150 ease-in-out flex items-center space-x-1.5 ${!window.electronAPI ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Add all images in a folder"
              >
                <FolderIcon size={14} />
                 <span>Folder</span>
              </button>
                <button
                    onClick={() => setIsSettingsVisible(true)}
                    className="p-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition"
                    title="Settings"
                >
                    <Settings size={16} />
                </button>
           </div>
        </header>

         {/* Tag Filter Bar */}
         {uniqueTags.length > 0 && (
             <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex flex-wrap gap-2 items-center text-xs flex-shrink-0">
                 <span className="text-gray-400 mr-2">Filter by Tag:</span>
                 {uniqueTags.map(tag => (
                     <button
                         key={tag}
                         onClick={() => handleTagFilterClick(tag)}
                         className={`px-2 py-0.5 rounded ${activeTagFilter === tag ? 'bg-indigo-600 text-white ring-1 ring-indigo-400' : 'bg-gray-600 text-gray-300 hover:bg-indigo-500 hover:text-white'} transition`}
                     >
                         {tag}
                     </button>
                 ))}
                 {activeTagFilter && (
                      <button onClick={() => setActiveTagFilter(null)} className="ml-auto text-red-400 hover:text-red-300 flex items-center" title="Clear tag filter">
                           Clear <X size={14} className="ml-1"/>
                      </button>
                  )}
             </div>
         )}


        {/* Image Grid */}
        <div
          className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"
          onClick={hideContextMenu}
        >
          {/* Conditional Rendering Placeholders */}
           {images.length === 0 && !window.electronAPI && (
                <div className="flex flex-col items-center justify-center h-full text-red-400">
                  <X size={48} className="mb-4" />
                  <p className="text-lg font-semibold">Backend Connection Error</p>
                  <p>Could not connect to Electron features.</p>
                   <p>Ensure the app is running via Electron, not just in the browser.</p>
                </div>
           )}
           {images.length === 0 && window.electronAPI && searchTerm === '' && !activeTagFilter && (
             <div className="flex flex-col items-center justify-center h-full text-gray-500">
               <ImageIcon size={48} className="mb-4" />
               <p>No images added yet.</p>
               <p>Click "+ Add Files" or "+ Add Folder" to get started.</p>
             </div>
           )}
           {filteredImages.length === 0 && (images.length > 0 || searchTerm !== '' || activeTagFilter) && (
               <div className="flex flex-col items-center justify-center h-full text-gray-500">
                   <Search size={48} className="mb-4" />
                   {activeTagFilter && <p className="mb-2">No images match the tag "{activeTagFilter}".</p>}
                   {searchTerm !== '' && <p>No images match your search term "{searchTerm}".</p>}
                   {!activeTagFilter && searchTerm === '' && images.length === 0 && <p>Add images to begin.</p>}
               </div>
           )}
          {/* Image Grid */}
          {filteredImages.length > 0 && (
            <div className={`grid ${getGridColsClass(gridColumns)} gap-4`}>
              {filteredImages.map((image) => (
                <div
                  key={image.id}
                  className={`relative group bg-gray-800 rounded-lg overflow-hidden shadow-lg border border-gray-700/50 flex flex-col aspect-[4/3] cursor-pointer transition-all duration-150 ease-in-out
                            ${selectedImageIds.has(image.id) ? 'border-indigo-500 ring-2 ring-indigo-500 scale-[0.98]' : 'hover:shadow-indigo-500/30'}`}
                  onContextMenu={(e) => handleContextMenu(e, image.id, image.path)}
                  onClick={(e) => handleImageClick(image.id, e)}
                  onDoubleClick={() => imageObjectURLs[image.id] && !imageObjectURLs[image.id].includes('placehold.co') ? openPreview(imageObjectURLs[image.id], getBasename(image.path)) : null}
                  style={{ minHeight: '150px' }}
                >
                    {/* Image Area */}
                  <div className="flex-grow relative bg-gray-700" style={{ minHeight: '80px'}}>
                      <img
                        src={imageObjectURLs[image.id] || `https://placehold.co/200x150/777/eee?text=Loading...`}
                        alt={getBasename(image.path)}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                       />
                       {/* Selection Checkbox Overlay */}
                       <div className={`absolute top-1.5 left-1.5 p-0.5 rounded ${selectedImageIds.has(image.id) ? 'bg-indigo-600/80 opacity-100' : 'bg-black/50 opacity-0 transition-opacity group-hover:opacity-100'}`}>
                           {selectedImageIds.has(image.id) ? <CheckSquare size={16} className="text-white" /> : <Square size={16} className="text-gray-300" />}
                       </div>
                   </div>

                  {/* Info Area */}
                   <div className="p-2 flex-shrink-0 flex flex-col space-y-1">
                     {/* Description Textarea */}
                      {editingDescId === image.id ? (
                        <textarea
                          ref={editInputRef}
                          value={editDescription}
                          onChange={handleEditInputChange}
                          onKeyDown={handleEditInputKeyDown}
                          onBlur={handleSaveDescEdit}
                          className="w-full bg-gray-600 border border-indigo-500 rounded-md p-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-600"
                          placeholder="Editing description..."
                          rows={2}
                          onClick={(e) => e.stopPropagation()}
                        />
                     ) : (
                        <textarea
                          value={image.description}
                          onChange={(e) => handleDescriptionChangeWithDebounce(image.id, e.target.value)}
                          onDoubleClick={() => handleEditDescription()}
                          className="w-full bg-gray-700 border border-gray-600 rounded-md p-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-700 placeholder-gray-400 cursor-text"
                          placeholder="Add description (dbl-click to edit)..."
                          rows={2}
                          readOnly
                          onClick={(e) => e.stopPropagation()}
                        />
                     )}
                     {/* Tags Area */}
                     <div className="flex flex-wrap gap-1 items-center min-h-[24px]">
                       {(image.tags || []).map(tag => (
                         <span key={tag} className="tag-item flex items-center bg-gray-600 text-gray-300 text-xs px-1.5 py-0.5 rounded hover:bg-red-600/50 group/tag cursor-pointer" title={`Click to remove tag: ${tag}`} onClick={(e) => { e.stopPropagation(); handleRemoveTag(image.id, tag); }}>
                           {tag}
                           <X size={10} className="ml-1 opacity-0 group-hover/tag:opacity-100 transition-opacity" />
                         </span>
                       ))}
                       {editingTagsId === image.id ? (
                           <input
                             ref={tagInputRef} type="text" value={currentTagsInput}
                             onChange={(e) => setCurrentTagsInput(e.target.value)}
                             onKeyDown={(e) => handleTagInputKeyDown(e, image.id)}
                             onBlur={() => handleTagInputBlur(image.id)}
                             className="flex-grow bg-gray-600 border border-indigo-500 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 min-w-[50px]"
                             placeholder="tag1, tag2..." onClick={(e) => e.stopPropagation()}
                           />
                       ) : (
                           <button onClick={(e) => { e.stopPropagation(); handleStartEditingTags(image.id); }} className="text-indigo-400 hover:text-indigo-300 text-xs ml-1 p-0.5 rounded hover:bg-gray-600" title="Edit Tags">
                               <Tag size={12}/>
                           </button>
                       )}
                     </div>
                     {/* Folder & Filename */}
                      <div className="flex items-center justify-between text-xs mt-1">
                         <span className="text-gray-500 truncate flex-shrink mr-1" title={`Folder: ${image.folderName || 'N/A'}`}>
                              <FolderOpen size={12} className="inline mr-1 opacity-70" /> {image.folderName || 'N/A'}
                          </span>
                         <span className="text-gray-400 truncate flex-grow text-right" title={getBasename(image.path)}>
                             {getBasename(image.path)}
                          </span>
                      </div>
                   </div>

                    {/* Loading Indicator */}
                    {loadingAI[image.id] && (
                        <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center text-white text-xs z-10 rounded-lg">
                            <Loader2 size={24} className="animate-spin mb-1" />
                            <span>Generating AI...</span>
                        </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Context Menu (with AI prompt dropdown) */}
        {contextMenu.visible && (
          <div
            ref={contextMenuRef}
            style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
            className="absolute bg-gray-700 border border-gray-600 rounded-md shadow-xl py-1 z-50 text-sm min-w-[240px]" // Wider
            onClick={(e) => e.stopPropagation()}
          >
             {/* Common Dropdown Area */}
              <div className="px-3 pt-1 pb-2 border-b border-gray-600">
                  <label htmlFor="aiPromptSelect" className="block text-xs text-gray-400 mb-1">AI Prompt Mode:</label>
                  <select
                      id="aiPromptSelect"
                      value={contextMenu.promptKey}
                      onChange={(e) => setContextMenu(prev => ({ ...prev, promptKey: e.target.value }))}
                      className="w-full text-xs bg-gray-600 border border-gray-500 text-white rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      disabled={!isAiConfigured()}
                  >
                      {Object.keys(aiPrompts).length > 0 ? (
                        Object.entries(aiPrompts).map(([key, value]) => (
                            <option key={key} value={key}>{key.charAt(0).toUpperCase() + key.slice(1)}</option>
                        ))
                       ) : (
                         <option value={DEFAULT_PROMPT_KEY}>Basic</option> // Fallback if prompts haven't loaded
                       )}
                      {!isAiConfigured() && <option disabled>API Key Needed</option>}
                  </select>
              </div>

             {selectedImageIds.size > 1 && selectedImageIds.has(contextMenu.imageId) ? (
                 // --- Bulk Actions ---
                 <>
                     <button onClick={() => handleDescribeSelectedWithAI(contextMenu.promptKey)} className="w-full flex items-center px-4 py-2 hover:bg-indigo-600 hover:text-white transition duration-150 ease-in-out text-left disabled:opacity-50 disabled:cursor-not-allowed" disabled={!window.electronAPI?.describeImage || !isAiConfigured()}>
                       <Bot size={16} className="mr-2 flex-shrink-0" /> Describe {selectedImageIds.size} ({contextMenu.promptKey})
                     </button>
                     {/* TODO: Add Bulk Edit Tags here */}
                     <div className="border-t border-gray-600 my-1"></div>
                     <button onClick={handleRemoveSelected} className="w-full flex items-center px-4 py-2 text-red-400 hover:bg-red-600 hover:text-white transition duration-1S0 ease-in-out text-left disabled:opacity-50 disabled:cursor-not-allowed" disabled={!window.electronAPI?.removeImagesBulk}>
                       <Trash2 size={16} className="mr-2 flex-shrink-0" /> Remove {selectedImageIds.size} Selected
                     </button>
                 </>
             ) : (
                // --- Single Image Actions ---
                 <>
                    <button onClick={() => handleDescribeWithAI(contextMenu.imageId, contextMenu.filePath, contextMenu.promptKey)} className="w-full flex items-center px-4 py-2 hover:bg-indigo-600 hover:text-white transition duration-150 ease-in-out text-left disabled:opacity-50 disabled:cursor-not-allowed" disabled={!window.electronAPI?.describeImage || !isAiConfigured()}>
                      <Bot size={16} className="mr-2 flex-shrink-0" /> Describe ({contextMenu.promptKey})
                    </button>
                    <button onClick={handleEditDescription} className="w-full flex items-center px-4 py-2 hover:bg-indigo-600 hover:text-white transition duration-150 ease-in-out text-left">
                      <Edit2 size={16} className="mr-2 flex-shrink-0" /> Edit Description
                    </button>
                    <button onClick={() => handleStartEditingTags(contextMenu.imageId)} className="w-full flex items-center px-4 py-2 hover:bg-indigo-600 hover:text-white transition duration-150 ease-in-out text-left">
                       <Tag size={16} className="mr-2 flex-shrink-0" /> Edit Tags
                    </button>
                    {window.electronAPI?.openFolder && contextMenu.filePath &&
                         <button onClick={handleOpenFolder} className="w-full flex items-center px-4 py-2 hover:bg-indigo-600 hover:text-white transition duration-150 ease-in-out text-left">
                          <FolderOpen size={16} className="mr-2 flex-shrink-0" /> Open Folder
                         </button>
                    }
                     <button onClick={() => imageObjectURLs[contextMenu.imageId] && !imageObjectURLs[contextMenu.imageId].includes('placehold.co') ? openPreview(imageObjectURLs[contextMenu.imageId], getBasename(contextMenu.filePath)) : null} className="w-full flex items-center px-4 py-2 hover:bg-indigo-600 hover:text-white transition duration-150 ease-in-out text-left disabled:opacity-50 disabled:cursor-not-allowed" disabled={!imageObjectURLs[contextMenu.imageId] || (imageObjectURLs[contextMenu.imageId] && imageObjectURLs[contextMenu.imageId].includes('placehold.co'))}>
                        <ZoomIn size={16} className="mr-2 flex-shrink-0" /> Preview Image
                     </button>
                    <div className="border-t border-gray-600 my-1"></div>
                    <button onClick={() => handleRemoveImage(contextMenu.imageId)} className="w-full flex items-center px-4 py-2 text-red-400 hover:bg-red-600 hover:text-white transition duration-150 ease-in-out text-left disabled:opacity-50 disabled:cursor-not-allowed" disabled={!window.electronAPI?.removeImagesBulk}>
                      <Trash2 size={16} className="mr-2 flex-shrink-0" /> Remove
                    </button>
                 </>
             )}
          </div>
        )}

        {/* Image Preview Modal */}
         {previewImage && (
             <div
                 className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4" // Added padding
                 onClick={closePreview} // Click background to close
             >
                 <div className="max-w-[90vw] max-h-[90vh] relative">
                      {/* Added loading check for preview */}
                      {previewImage.src && !previewImage.src.includes('placehold.co') ? (
                          <img
                             src={previewImage.src}
                             alt={previewImage.alt}
                             className="block max-w-full max-h-full object-contain rounded-lg shadow-xl bg-gray-800" // Added background
                             onClick={(e) => e.stopPropagation()} // Prevent clicks on image closing modal
                          />
                      ) : (
                          <div className="p-10 bg-gray-700 rounded-lg text-center text-gray-400">
                              Image not loaded or invalid.
                          </div>
                      )}
                     <button
                         onClick={closePreview}
                         className="absolute -top-3 -right-3 p-1 bg-gray-700 rounded-full text-white hover:bg-red-600 transition shadow-lg"
                         aria-label="Close preview"
                     >
                         <X size={20} />
                     </button>
                 </div>
             </div>
         )}


         {/* Notification Area */}
         {notification.visible && (
             <div className={`fixed bottom-4 right-4 p-3 rounded-lg shadow-xl text-sm z-[100] flex items-center max-w-sm
             ${notification.type === 'success' ? 'bg-green-600 text-white' : ''}
             ${notification.type === 'error' ? 'bg-red-600 text-white' : ''}
             ${notification.type === 'info' ? 'bg-blue-600 text-white' : ''}
          `}>
             <span className="flex-grow mr-2">{notification.message}</span>
             <button onClick={() => setNotification(prev => ({ ...prev, visible: false }))} className="ml-auto text-xl font-semibold leading-none flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/20">&times;</button>
          </div>
         )}
      </main>

        <SettingsModal
            isVisible={isSettingsVisible}
            prompts={aiPrompts}
            onClose={() => setIsSettingsVisible(false)}
            onSave={handleSavePrompts}
        />
    </div>
  );
}

export default App;

