// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";

const AuthContext = createContext();

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL + "/api", // ✅ env se URL
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [loading, setLoading] = useState(false);

  const isAuthenticated = !!token;

  // ✅ Normal Email/Password Login
  const login = async (email, password) => {
    setLoading(true);
    try {
      const response = await API.post("/auth/login", { email, password });

      if (response.data.success) {
        localStorage.setItem("token", response.data.token);
        setToken(response.data.token);
        setUser(response.data.user);
        toast.success("Login successful!");
        return true;
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Login failed");
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ✅ Signup
  const signup = async (name, email, phone, password) => {
    setLoading(true);
    try {
      const response = await API.post("/auth/signup", {
        name,
        email,
        phone,
        password,
      });

      if (response.data.success) {
        localStorage.setItem("token", response.data.token);
        setToken(response.data.token);
        setUser(response.data.user);
        toast.success("Account created successfully!");
        return true;
      }
      return false;
    } catch (error) {
      toast.error(error.response?.data?.message || "Signup failed");
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ✅ Google OAuth Login
  const googleLogin = async (googleToken) => {
    setLoading(true);
    try {
      // googleToken = credential from GoogleLogin component
      const response = await API.post("/auth/google", {
        token: googleToken,
      });

      if (response.data.success) {
        localStorage.setItem("token", response.data.token);
        setToken(response.data.token);
        setUser(response.data.user);
        toast.success("Logged in with Google!");
        return true;
      }
      return false;
    } catch (error) {
      toast.error(error.response?.data?.message || "Google login failed");
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ✅ Logout
  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    toast.success("Logged out successfully");
  };

  // ✅ Check Auth on refresh
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem("token");
      if (storedToken) {
        try {
          const response = await API.get("/auth/check", {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (response.data.authenticated) {
            setToken(storedToken);
            setUser(response.data.user);
          }
        } catch (error) {
          localStorage.removeItem("token");
        }
      }
    };
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated,
        login,
        signup,
        googleLogin, // ✅ add kiya
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
