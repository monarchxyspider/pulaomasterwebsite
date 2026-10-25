
import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseOptions,
} from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFunctions } from "firebase/functions";

const firebaseConfig: FirebaseOptions = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    "AIzaSyA9TtLxBxm58ZwXYiWfNUhAmgsj2bWOKIc",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    "resturant-db-f2cd9.firebaseapp.com",
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    "https://resturant-db-f2cd9-default-rtdb.firebaseio.com",
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || "resturant-db-f2cd9",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    "resturant-db-f2cd9.firebasestorage.app",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "46488397895",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    "1:46488397895:web:f63d63e1c2d43cfa636962",
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-6V0D99D5C3",
};

export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const database = getDatabase(firebaseApp);
export const auth = getAuth(firebaseApp);
export const functions = getFunctions(firebaseApp, "us-central1");

void setPersistence(auth, browserLocalPersistence).catch(() => undefined);

const customerAppName = "pulao-customer-access";

export function getCustomerAuth(): Auth {
  const customerApp =
    getApps().find((app) => app.name === customerAppName) ??
    initializeApp(firebaseConfig, customerAppName);

  return getAuth(customerApp);
}

export const restaurantContact = {
  phone: import.meta.env.VITE_CONTACT_PHONE || "03009263111",
  whatsapp: import.meta.env.VITE_WHATSAPP_NUMBER || "923009263111",
};
