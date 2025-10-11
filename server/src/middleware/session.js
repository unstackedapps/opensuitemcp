import session from 'express-session';
import FileStore from 'session-file-store';

const FileStoreSession = FileStore(session);

export const sessionMiddleware = session({
    store: new FileStoreSession({
        path: '../.sessions', // Store sessions OUTSIDE server directory to avoid nodemon restarts
        ttl: 7 * 24 * 60 * 60, // 7 days in seconds
        retries: 0,
        secret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production'
    }),
    secret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
    resave: false, // Don't save session if unmodified
    saveUninitialized: false, // Don't create session until something stored
    name: 'netsuite.sid', // Custom session cookie name
    rolling: true, // Reset expiration on every response
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'lax' // Allow cookie to be sent on redirects
    }
});

