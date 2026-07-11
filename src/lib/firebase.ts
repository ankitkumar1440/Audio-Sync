import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const envConfig: Partial<FirebaseConfig> = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isEnvConfigComplete = !!(
  envConfig.apiKey &&
  envConfig.projectId &&
  envConfig.appId
);

export function getFirebaseConfig(): FirebaseConfig | null {
  if (isEnvConfigComplete) {
    return envConfig as FirebaseConfig;
  }
  
  if (typeof window !== 'undefined') {
    const localConfigStr = localStorage.getItem('audiosync_firebase_config');
    if (localConfigStr) {
      try {
        return JSON.parse(localConfigStr) as FirebaseConfig;
      } catch (e) {
        console.error('Error parsing local firebase config:', e);
      }
    }
  }
  
  return null;
}

export function isFirebaseConfigured(): boolean {
  return getFirebaseConfig() !== null;
}

export function isConfigFromEnv(): boolean {
  return isEnvConfigComplete;
}

export function setLocalFirebaseConfig(config: FirebaseConfig) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('audiosync_firebase_config', JSON.stringify(config));
    window.location.reload();
  }
}

export function resetFirebaseConfig() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('audiosync_firebase_config');
    window.location.reload();
  }
}

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;

export function getDb(): Firestore {
  if (dbInstance) return dbInstance;
  
  const config = getFirebaseConfig();
  if (!config) {
    throw new Error('Firebase is not configured yet. Set environment variables or configure via settings UI.');
  }
  
  if (getApps().length === 0) {
    appInstance = initializeApp(config);
  } else {
    appInstance = getApp();
  }
  
  dbInstance = getFirestore(appInstance);
  return dbInstance;
}
