// src/socket.js
import { io } from "socket.io-client";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:8000";

export const socket = io(SOCKET_URL); // make sure port matches backend