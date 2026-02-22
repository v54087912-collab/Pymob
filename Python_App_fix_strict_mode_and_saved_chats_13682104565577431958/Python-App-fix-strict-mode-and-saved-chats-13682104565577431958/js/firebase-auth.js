
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { showToast } from "./ui-utils.js";

const getEnv = (key) => {
    try {
        return (import.meta.env && import.meta.env[key]) || "";
    } catch (e) {
        return "";
    }
};

const firebaseConfig = {
    apiKey: getEnv("VITE_FIREBASE_API_KEY"),
    authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: getEnv("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: getEnv("VITE_FIREBASE_APP_ID"),
    measurementId: getEnv("VITE_FIREBASE_MEASUREMENT_ID")
};

let app;
let auth;

try {
    if (!firebaseConfig.apiKey) {
        console.warn("Firebase Config missing. Auth features will be disabled.");
    } else {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);

        // Ensure persistence is set
        setPersistence(auth, browserLocalPersistence).catch(console.error);
    }
} catch (error) {
    console.error("Firebase Initialization Error:", error);
}

// 3. Auth State Listener & Initialization
export function initAuth(onUserChange) {
    if (!auth) {
        console.warn("Auth not initialized.");
        setTimeout(() => onUserChange(null), 100);
        return;
    }

    // The main listener. This fires on load (restoring session) and on login/logout.
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("[Auth] State Changed: User Logged In", user.uid);
            onUserChange(user);
        } else {
            console.log("[Auth] State Changed: User Logged Out");
            onUserChange(null);
        }
    });
}

function handleAuthError(error) {
    let msg = `Login Failed: ${error.message}`;
    showToast(msg, 'error');
}

export async function signInWithEmail(email, password) {
    // Email/Password doesn't require popups, so it works fine here.
    if (!auth) {
        showToast("Authentication is not configured.", 'error');
        return;
    }
    try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Email Sign-In Error:", error);
        let msg = "Login Failed: ";
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            msg += "Incorrect email or password. Please check your credentials.";
        } else if (error.code === 'auth/invalid-email') {
            msg += "Invalid email address format.";
        } else {
            msg += error.message;
        }
        showToast(msg, 'error');
    }
}

export async function signUpWithEmail(email, password) {
    if (!auth) {
        showToast("Authentication is not configured.", 'error');
        return;
    }
    try {
        await setPersistence(auth, browserLocalPersistence);
        await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Email Sign-Up Error:", error);
        let msg = "Sign Up Failed: ";
        if (error.code === 'auth/email-already-in-use') {
            msg += "This email is already registered. Please Log In instead.";
        } else if (error.code === 'auth/weak-password') {
            msg += "Password should be at least 6 characters.";
        } else if (error.code === 'auth/invalid-email') {
            msg += "Invalid email address format.";
        } else {
            msg += error.message;
        }
        showToast(msg, 'error');
    }
}

export async function signOutUser() {
    if (!auth) return;
    try {
        await signOut(auth);
        localStorage.removeItem('pyide_user_details');
    } catch (error) {
        console.error("Sign Out Error:", error);
    }
}
