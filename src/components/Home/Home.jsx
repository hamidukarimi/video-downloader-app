// Home.jsx
import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FaArrowDown,
  FaDiscord,
  FaDownload,
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaPlay,
  FaRedditAlien,
  FaTiktok,
} from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const previewCache = new Map(); // url -> meta

export default function Home() {
  const [url, setUrl] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [meta, setMeta] = useState(null); // { title, thumbnail, author }
  const [error, setError] = useState("");
  const [type, setType] = useState("video"); // video | audio
  const [format, setFormat] = useState("mp4"); // mp4 | webm | mp3 | mkv
  const [quality, setQuality] = useState("best"); // best | 1080 | 720 | 480 | 360 | lowest
  const navigate = useNavigate();
  const inputRef = useRef(null);

  // Abort controller for metadata fetches
  const metaAbortRef = useRef(null);

  // For UX: treat "supported" quick-detection (you can extend)
  function looksLikeUrl(v) {
    if (!v) return false;
    try {
      // allow URLs without protocol (e.g., youtube.com/...)
      const hasProtocol = v.startsWith("https://") || v.startsWith("https://");
      const parsed = new URL(hasProtocol ? v : `https://${v}`);
      return !!parsed.hostname;
    } catch (e) {
      return false;
    }
  }

  // Try to extract YouTube video id (11 chars) quickly to show thumbnail instantly
  function extractYouTubeId(value) {
    if (!value) return null;
    const v = value.trim();
    // patterns: youtu.be/ID or youtube.com/watch?v=ID or youtube.com/shorts/ID or embed/ID
    const m =
      v.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/|v\/))([0-9A-Za-z_-]{11})/) ||
      v.match(/([0-9A-Za-z_-]{11})/);
    return m && m[1] ? m[1] : null;
  }

  // small helper to set meta and clear error
  function applyMeta(newMeta) {
    setMeta(newMeta);
    setError("");
    setLoadingMeta(false);
  }

  // Main metadata fetcher (fast + robust)
  // Replace your existing fetchMetadata with this function
async function fetchMetadata(videoUrl) {
  if (!videoUrl) return;
  const trimmed = videoUrl.trim();

  // If cached: apply immediately
  if (previewCache.has(trimmed)) {
    applyMeta(previewCache.get(trimmed));
    return previewCache.get(trimmed);
  }

  // Abort any previous meta fetch
  if (metaAbortRef.current) {
    try { metaAbortRef.current.abort(); } catch (e) {}
    metaAbortRef.current = null;
  }
  const controller = new AbortController();
  metaAbortRef.current = controller;

  setLoadingMeta(true);
  setMeta(null);
  setError("");

  // immediate optimistic thumbnail for YouTube ids
  const ytId = extractYouTubeId(trimmed);
  if (ytId) {
    const optimistic = { title: "", thumbnail: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`, author: "" };
    setMeta(optimistic);
  }

  // 1) Primary: ask our backend (server-side) for metadata
  try {
    const serverRes = await axios.get("https://video-downloader-backend-3jov.onrender.com/meta", {
      params: { url: trimmed },
      timeout: 15000,
      signal: controller.signal,
    });

    if (serverRes?.data?.ok && serverRes.data.meta) {
      previewCache.set(trimmed, serverRes.data.meta);
      if (!controller.signal.aborted) applyMeta(serverRes.data.meta);
      return serverRes.data.meta;
    }
  } catch (e) {
    // server failed (maybe yt-dlp error) — we'll fall back to client heuristics below
    console.warn("Server metadata failed, falling back to client heuristics", e?.response?.data || e?.message || e);
  }

  // 2) Fallback: try noembed + youtube oEmbed (as before) — useful when backend unreachable
  const calls = [];

  calls.push(
    (async () => {
      try {
        const r = await axios.get("https://noembed.com/embed", {
          params: { url: trimmed },
          timeout: 9000,
          signal: controller.signal,
        });
        if (r?.data?.title) {
          return { title: r.data.title, thumbnail: r.data.thumbnail_url, author: r.data.author_name || "" };
        }
      } catch (e) { /* ignore */ }
      return null;
    })()
  );

  calls.push(
    (async () => {
      try {
        const r = await axios.get("https://www.youtube.com/oembed", {
          params: { url: trimmed, format: "json" },
          timeout: 7000,
          signal: controller.signal,
        });
        if (r?.data?.title) {
          return { title: r.data.title, thumbnail: r.data.thumbnail_url, author: r.data.author_name || "" };
        }
      } catch (e) { /* ignore */ }
      return null;
    })()
  );

  try {
    const results = await Promise.all(calls.map(p => p.catch(() => null)));
    const first = results.find(r => r && r.title);
    if (first) {
      previewCache.set(trimmed, first);
      if (!controller.signal.aborted) applyMeta(first);
      return first;
    }

    // If nothing and we have YT id, keep the optimistic thumbnail
    if (ytId) {
      const fallback = { title: `YouTube video (${ytId})`, thumbnail: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`, author: "" };
      previewCache.set(trimmed, fallback);
      if (!controller.signal.aborted) applyMeta(fallback);
      return fallback;
    }

    // Last resort: do not attempt axios.get(trimmed) in browser (CORS). Just show "unsupported" message.
    if (!controller.signal.aborted) {
      setError("Couldn't fetch preview for this URL (possibly blocked by CORS). You can still continue to download.");
      setLoadingMeta(false);
    }
    return null;
  } finally {
    metaAbortRef.current = null;
  }
}


  // handle URL submit (Enter or arrow button)
  async function handleSubmitUrl() {
    setError("");
    if (!url.trim()) {
      setError("Please enter a video URL.");
      return;
    }
    if (!looksLikeUrl(url)) {
      setError("That doesn't look like a valid URL. Try a full link like https://youtube.com/...");
      return;
    }
    try {
      await fetchMetadata(url.trim());
    } catch (e) {
      console.error("fetchMetadata error:", e);
      setError("Preview failed. You can still continue to download.");
      setLoadingMeta(false);
    }
  }

  // Handle main Download button: validate then navigate to DownloadVideo component with state
  function handleDownloadClick() {
    setError("");
    if (!url.trim()) {
      setError("Please enter a video URL.");
      return;
    }
    if (!looksLikeUrl(url)) {
      setError("Please enter a valid URL before continuing.");
      return;
    }
    if (loadingMeta) {
      // we allow but warn user
      // (if you prefer to block until preview ready, change to return + setError)
      // setError("Still loading preview. Wait a moment.");
      // return;
    }

    const stateObj = {
      url: url.trim(),
      meta, // can be null
      options: { type, format, quality },
    };

    navigate("/download-video", { state: stateObj });
  }

  // keyboard enter
  function onKeyDown(e) {
    if (e.key === "Enter") handleSubmitUrl();
  }

  // format options depend on type
  const formatOptions = type === "audio"
    ? [{ value: "mp3", label: "MP3 (audio)" }]
    : [
        { value: "mp4", label: "MP4 (widely supported)" },
        { value: "webm", label: "WebM (modern, may be smaller)" },
        { value: "mkv", label: "MKV (container)" },
      ];

  const qualityOptions = type === "audio"
    ? [{ value: "best", label: "Best (highest bitrate)" }]
    : [
        { value: "best", label: "Best available" },
        { value: "1080", label: "1080p" },
        { value: "720", label: "720p" },
        { value: "480", label: "480p" },
        { value: "360", label: "360p" },
        { value: "lowest", label: "Lowest (small size)" },
      ];

  // small spinner (keeps your design, minimal)
  function SpinnerSmall() {
    return (
      <svg className="animate-spin h-4 w-4 text-slate-300" xmlns="https://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
    );
  }

  // small helper: quick "paste" handler to auto-fetch metadata when a url is pasted
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onPaste = (e) => {
      // wait a tick for pasted value to be populated
      setTimeout(() => {
        const v = el.value;
        if (v && looksLikeUrl(v)) {
          // auto fetch metadata but don't block user
          fetchMetadata(v.trim()).catch(() => {});
        }
      }, 50);
    };
    el.addEventListener("paste", onPaste);
    return () => el.removeEventListener("paste", onPaste);
  }, []);


    // Animation variants
  const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
  };

  // Keep design identical, only behavior changed
  return (
    <div className="min-h-screen bg-black text-white flex justify-center">
      <div className="w-full max-w-[420px] px-4 pb-12">
        <motion.div
          variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="pt-4"
        >
          {/* <div className="text-[28px] font-bold italic tracking-tight">vidiflow</div> */}
          <img className="w-28" src="./logo.svg"/>
        </motion.div>

        <motion.div
          variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-20 text-center"
        >
          <h1 className="text-white text-[16px] font-semibold">Free Online Video Downloader</h1>
        </motion.div>

        {/* input */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-5 relative"
        >
          <div className="flex items-center bg-[#070707] border border-[#1f2937] rounded-[6px] overflow-hidden">
            <input
              ref={inputRef}
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(""); }}
              onKeyDown={onKeyDown}
              className="flex-1 px-4 py-3 bg-transparent text-white placeholder:text-slate-400 outline-none text-sm"
              placeholder="Enter the video URL"
            />
            <button
              onClick={handleSubmitUrl}
              aria-label="submit-url"
              className="px-4 py-3  transition-all flex items-center justify-center"
              disabled={!looksLikeUrl(url)}
              title={!looksLikeUrl(url) ? "Enter a valid URL first" : "Fetch preview"}
            >
              {loadingMeta ? <SpinnerSmall /> : <FaArrowDown />}
            </button>
          </div>
        </motion.div>

        {/* preview area */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-6 overflow-hidden h-[200px]"
        >
          <div className="w-full h-full bg-[#0b0b0b] flex items-center justify-center">
            {loadingMeta ? (
             <div className="spinner w-[35px] h-[35px]"></div>
            ) : meta && meta.thumbnail ? (
              <img src={meta.thumbnail} alt={meta.title} className="w-full h-full object-cover" />
            ) : (
              <div className="text-sm text-slate-400 px-6 text-center">
                Preview will appear here after you paste a video link and press enter.
                {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
              </div>
            )}
          </div>
        </motion.div>

        {/* metadata title */}
        {meta && meta.title && (
          <motion.div
            variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mt-4 px-2"
          >
            <div className="text-sm font-semibold truncate">{meta.title}</div>
            <div className="text-xs text-slate-400">{meta.author}</div>
          </motion.div>
        )}

        {/* options + download */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-6 grid gap-3"
        >
          <section className="flex items-center ">
          {/* Type */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Type</label>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value); setFormat(e.target.value === "audio" ? "mp3" : "mp4"); }}
              className="w-full outline-none bg-[#070707] border border-[#2b2b2b] rounded-l px-3 py-2 text-sm"
            >
              <option value="video">Video (video + audio)</option>
              <option value="audio">Audio only</option>
            </select>
          </div>

          {/* Format */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full outline-none bg-[#070707] border border-[#2b2b2b]  px-3 py-2 text-sm">
              {formatOptions.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quality */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Quality</label>
            <select value={quality} onChange={(e) => setQuality(e.target.value)} className="w-full outline-none bg-[#070707] border border-[#2b2b2b] rounded-r px-3 py-2 text-sm">
              {qualityOptions.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>

          </section>

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-2">
            {/* <button onClick={handleDownloadClick} className="flex items-center justify-center gap-2 px-4 py-3 bg-[#29BBFF] rounded text-black font-semibold">
              <FaDownload /> Next
            </button> */}

              <button
            onClick={handleDownloadClick}
            className="flex-1 py-2 px-2 bg-[#29BBFF] hover:bg-[#008ec6] transition-all rounded-l-[6px] text-white font-semibold flex items-center justify-center gap-2"
          >
            <FaDownload />
            Download
          </button>

            <button
              onClick={() => {
                setUrl("");
                setMeta(null);
                setError("");
                inputRef.current?.focus();
              }}
              className="px-2 py-2 border border-[#2b2b2b] rounded-l-[6px] text-sm  hover:text-gray-300 transition-all font-semibold flex items-center justify-center"
            >
              Clear
            </button>
          </div>

          {error && <div className="text-sm text-red-400">{error}</div>}
        </motion.div>

 {/* Supported platforms */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-16 mb-7 text-center"
        >
          <h2 className="text-white font-semibold text-[15px]">
            supported platforms
          </h2>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-4 px-8 flex items-center justify-center flex-wrap gap-[20px]"
        >
          <SmallIcon bg="#FF0000">
            <FaPlay />
          </SmallIcon>
          <SmallIcon bg="#000000">
            <FaTiktok />
          </SmallIcon>
          <SmallIcon bg="#1877F2">
            <FaFacebookF />
          </SmallIcon>
          <SmallIcon bg="#E4405F">
            <FaInstagram />
          </SmallIcon>
          <SmallIcon bg="#FF4500">
            <FaRedditAlien />
          </SmallIcon>
          <SmallIcon bg="#000000">
            <FaXTwitter />
          </SmallIcon>
        </motion.div>

        <motion.hr
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="border-t border-[#1f2937] mt-16 mb-6"
        />

        {/* Description sections */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-sm text-slate-300 leading-relaxed"
        >
          <h3 className="text-[16px] font-semibold text-white mb-2">
            Download Videos Easily with Netspace
          </h3>
          <p className="mb-4">
            Quickly grab your favorite online videos and music with SaveFrom.Net,
            a reliable and well-established video downloader...
          </p>

          <h3 className="text-[16px] font-semibold text-white mb-2">
            Download Videos Easily with Netspace
          </h3>
          <p className="mb-4">
            From trending YouTube videos and popular shows to can't-miss sports
            highlights, SaveFrom.Net handles it all...
          </p>
        </motion.div>

        {/* Mobile app button */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="flex justify-center mt-8"
        >
          <button className="w-full px-6 py-3 rounded-[7px] bg-[#3AC1FF] hover:bg-[#1ba9eb] transition-all text-white font-semibold">
            Download Our Mobile App
          </button>
        </motion.div>

        <motion.hr
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="border-t border-[#3ac1ff9b] mt-24 mb-6"
        />

        {/* Footer */}
        <motion.footer
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div>
             <img className="w-28" src="./logo.svg"/>
            <p className="text-sm text-slate-400 mt-4">
              Lorem Ipsum Doller amit something diffrent everytime more things
              are there for.
            </p>
            <div className="flex items-center gap-3 mt-4 text-slate-400">
              <FaLinkedinIn />
              <FaDiscord />
              <FaFacebookF />
              <FaInstagram />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 text-sm mt-6">
            <div>
              <h4 className="font-semibold mb-2">About</h4>
              <ul className="text-slate-300 space-y-1 text-xs">
                <li>About Us</li>
                <li>Our Mission</li>
                <li>Team Members</li>
                <li>Careers</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Courses</h4>
              <ul className="text-slate-300 space-y-1 text-xs">
                <li>Development</li>
                <li>Designing</li>
                <li>Business</li>
                <li>Marketing</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Support</h4>
              <ul className="text-slate-300 space-y-1 text-xs">
                <li>FAQs</li>
                <li>Help Center</li>
                <li>Technical Support</li>
                <li>Payment Methods</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Connect with Us</h4>
              <ul className="text-slate-300 space-y-1 text-xs">
                <li>LinkedIn</li>
                <li>Discord</li>
                <li>Facebook</li>
                <li>Instagram</li>
              </ul>
            </div>
          </div>

          <hr className="mt-8 border border-gray-500" />
          <div className="text-center text-slate-300 mt-5 text-sm">
            copyright 2025 vidiflow
          </div>
        </motion.footer>
        
      </div>
    </div>
  );
}


function SmallIcon({ children, bg = "#111" }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, scale: 0.8 },
        visible: { opacity: 1, scale: 1, transition: { duration: 0.5 } },
      }}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="w-[61px] h-[45px] border border-gray-700 rounded-[8px] flex items-center justify-center text-xl"
      style={{ background: bg }}
    >
      {children}
    </motion.div>
  );
}