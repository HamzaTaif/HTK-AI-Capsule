import { initializeApp } from "../libs/firebase/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updatePassword, updateProfile, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail } from "../libs/firebase/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc, query, where, getDocs, onSnapshot, limit, orderBy } from "../libs/firebase/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDbmFyO_yCEigshmTdaGO7EZ7jcbWG-aX0",
  authDomain: "synapse-ai-99dd0.firebaseapp.com",
  projectId: "synapse-ai-99dd0",
  storageBucket: "synapse-ai-99dd0.firebasestorage.app",
  messagingSenderId: "57638029332",
  appId: "1:57638029332:web:e26efcb030f017aaf0bf01",
  measurementId: "G-GW8K0SW5HD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

export { 
  auth, 
  provider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  db,
  collection,
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  limit,
  orderBy,
  updatePassword,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail
};

