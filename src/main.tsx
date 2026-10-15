import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {LibraryApp} from './library/LibraryApp';
import {loadProjectFonts} from './motion/typography/loader';
import './library/library.css';

void loadProjectFonts();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LibraryApp />
  </StrictMode>,
);
