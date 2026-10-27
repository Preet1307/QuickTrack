const isLocalQuickTrack = ['localhost', '127.0.0.1'].includes(window.location.hostname);
window.QUICKTRACK_API_BASE = isLocalQuickTrack ? 'http://localhost:3000/api' : '/api';
