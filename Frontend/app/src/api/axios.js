import axios from 'axios';

// Create an Axios instance with the base URL of the backend
const axiosInstance = axios.create({
  baseURL: 'http://localhost:5000', // Replace with the actual backend URL
  headers: {
    'Content-Type': 'application/json',
  },
  // Add timeout and other configurations
  timeout: 5000,
  withCredentials: true
});

// Add request interceptor for debugging
axiosInstance.interceptors.request.use(
  (config) => {
    console.log('Request being sent:', config);
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
axiosInstance.interceptors.response.use(
  (response) => {
    console.log('Response received:', response);
    return response;
  },
  (error) => {
    console.error('Response error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default axiosInstance;
