import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

function SettingsModal({ isVisible, prompts, onClose, onSave }) {
  const [editablePrompts, setEditablePrompts] = useState({});

  useEffect(() => {
    // When the modal is opened, sync the state with the props
    if (prompts) {
      setEditablePrompts(prompts);
    }
  }, [prompts, isVisible]);

  if (!isVisible) {
    return null;
  }

  const handlePromptChange = (key, value) => {
    setEditablePrompts(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveChanges = () => {
    onSave(editablePrompts);
  };

  // Sort keys to ensure a consistent order, but keep 'basic' first if it exists
  const sortedPromptKeys = Object.keys(editablePrompts).sort((a, b) => {
      if (a === 'basic') return -1;
      if (b === 'basic') return 1;
      return a.localeCompare(b);
  });


  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition"
            aria-label="Close settings"
          >
            <X size={20} />
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
           <div className="space-y-6">
              <h3 className="text-md font-semibold text-indigo-400 border-b border-gray-600 pb-2">Customize AI Prompts</h3>
              {sortedPromptKeys.map((key) => (
                <div key={key}>
                  <label
                    htmlFor={`prompt-${key}`}
                    className="block text-sm font-medium text-gray-300 mb-1 capitalize"
                  >
                    {key.replace(/_/g, ' ')}
                  </label>
                  <textarea
                    id={`prompt-${key}`}
                    value={editablePrompts[key]}
                    onChange={(e) => handlePromptChange(key, e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y min-h-[80px] scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-700"
                    rows={3}
                  />
                </div>
              ))}
            </div>
        </main>

        {/* Footer */}
        <footer className="flex items-center justify-end p-4 border-t border-gray-700 flex-shrink-0 space-x-3">
           <button
             onClick={onClose}
             className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-medium transition"
           >
            Cancel
           </button>
           <button
             onClick={handleSaveChanges}
             className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition flex items-center space-x-2"
           >
             <Save size={16} />
             <span>Save Changes</span>
           </button>
        </footer>
      </div>
    </div>
  );
}

export default SettingsModal;
