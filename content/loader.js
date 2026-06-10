'use strict';

// Manifest content scripts can't be declared as ES modules, so this classic
// stub pulls in the real entry point. content/ and shared/ are listed in
// web_accessible_resources so the imports are fetchable on app.clockify.me.
import(chrome.runtime.getURL('content/main.js'))
  .catch((err) => console.error('[clockify-salary] failed to load content script:', err));
