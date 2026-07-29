import React from 'react';
import ReactDOM from 'react-dom/client';
import '../tokens.css';
import '../index.css';
import './visual-test.css';
import VisualTestApp from './VisualTestApp';

ReactDOM.createRoot(document.getElementById('visual-test-root')).render(
  <React.StrictMode>
    <VisualTestApp />
  </React.StrictMode>
);
