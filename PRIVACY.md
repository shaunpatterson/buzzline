# Buzzline privacy policy

Buzzline does not collect, transmit, sell or share any personal data.

- **Page content** is read only inside your browser to decide which text to colour and to power Sprint/Reader. It never leaves your device.
- **Settings** (on/off, colour scheme, per-site choices, Sprint speed) are stored with `chrome.storage.sync`, which your browser may sync across your own signed-in devices. Buzzline's developer cannot see them.
- **Feedback** you mark ("should / shouldn't be coloured") is stored locally with `chrome.storage.local` and is only exported if you click Export in the options page yourself.
- Buzzline makes **no network requests**, uses no analytics, and loads no remote code.

Permissions: `storage` (save settings), `activeTab` and `contextMenus` (Sprint/Reader on the current page from the right-click menu and keyboard shortcuts), content script on all sites (colour text on pages you read).

Contact: open an issue at https://github.com/shaunpatterson/buzzline/issues
