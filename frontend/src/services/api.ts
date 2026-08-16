import axios from 'axios';

export const api = axios.create({
  baseURL: 'https://reachinbox-scheduler-ms2m.onrender.com/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});
