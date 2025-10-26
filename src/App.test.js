import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import React from 'react';

// Mock data
const mockImages = [
  {
    id: '1',
    path: '/test/image1.jpg',
    description: 'A test image',
    tags: ['test', 'mock'],
    folderName: 'test',
  },
];

// Mock the global electronAPI object and other browser/electron features
beforeEach(() => {
  window.electronAPI = {
    loadImages: jest.fn().mockResolvedValue({ success: true, images: mockImages }),
    getAIPrompts: jest.fn().mockResolvedValue({ success: true, prompts: { basic: 'Describe this' } }),
    readFileAsBlob: jest.fn().mockResolvedValue(new Blob(['image data'], { type: 'image/jpeg' })),
  };
  // Mock URL.createObjectURL which is used to display images
  if (typeof window.URL.createObjectURL === 'undefined') {
    Object.defineProperty(window.URL, 'createObjectURL', { value: jest.fn((blob) => `blob:${blob.size}`) });
  } else {
    jest.spyOn(window.URL, 'createObjectURL').mockImplementation((blob) => `blob:${blob.size}`);
  }
});

afterEach(() => {
    jest.clearAllMocks();
});

test('renders the App component and toggles the view', async () => {
  render(<App />);

  // Default view is list, wait for it and check for an image
  expect(await screen.findByTestId('list-view')).toBeInTheDocument();
  expect(await screen.findByText('image1.jpg')).toBeInTheDocument();


  // Switch to grid view
  const gridViewButton = screen.getByLabelText('grid-view');
  fireEvent.click(gridViewButton);

  // The view should now be grid
  expect(await screen.findByTestId('grid-view')).toBeInTheDocument();
  // The list view should be gone
  expect(screen.queryByTestId('list-view')).not.toBeInTheDocument();
  // Check that the image is still rendered
  expect(await screen.findByText('image1.jpg')).toBeInTheDocument();


  // Switch back to list view
  const listViewButton = screen.getByLabelText('list-view');
  fireEvent.click(listViewButton);

  // The view should be list again
  expect(await screen.findByTestId('list-view')).toBeInTheDocument();
  // The grid view should be gone
  expect(screen.queryByTestId('grid-view')).not.toBeInTheDocument();
  // Check that the image is still rendered
  expect(await screen.findByText('image1.jpg')).toBeInTheDocument();
});
