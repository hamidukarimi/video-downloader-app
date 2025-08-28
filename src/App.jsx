import React, { useState, useEffect } from "react";
import "./App.css";
import { Routes, Route } from "react-router-dom";
import Home from "./components/Home/Home";
// import Users from "./components/Users/users";



import DownloadVideo from "./components/download-video/DownloadVideo";

const App = () => {
  console.log("Using API:", import.meta.env.VITE_API_BASE_URL);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Define a named handler so we can properly remove it later
    const handleLoad = () => setLoading(false);

    // If the document is already loaded, set loading to false immediately.
    if (document.readyState === "complete") {
      setLoading(false);
    } else {
      // Otherwise, add the load event listener.
      window.addEventListener("load", handleLoad);
      // Cleanup the event listener when the component unmounts.
      return () => window.removeEventListener("load", handleLoad);
      // a simple comment
    }
  }, []);

  // example codes the bellow
  const options = [
    { label: "Delete Post", onClick: () => console.log("delete") },
    { label: "Report Post", onClick: () => console.log("report") },
  ];

  return (
    <>
      {loading ? (
        <div className="loading_page">
          <div className="spinner"></div>
        </div>
      ) : (
        <>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/download-video" element={<DownloadVideo />} />
  >
          </Routes>
        </>
      )}
    </>
  );
};

export default App;
