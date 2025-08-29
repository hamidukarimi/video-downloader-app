// DownloadVideo.jsx
import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FaArrowLeft, FaPlay } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
// import API_BASE_URL from "../../config";
const BASE_URL = import.meta.env.VITE_BACKEND_URL;


export default function DownloadVideo() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const abortControllerRef = useRef(null);
  const pollingRef = useRef(null);

  // local state
  const [status, setStatus] = useState("idle"); // idle | downloading | polling | ready | downloading | done | error | cancelled
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0); // 0 - 100 (UI progress)
  const [downloadUrl, setDownloadUrl] = useState("");
  const [filename, setFilename] = useState("");
  const [totalBytes, setTotalBytes] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [speed, setSpeed] = useState(0); // bytes/sec

  // If user opened this page directly, go back to home
  useEffect(() => {
    if (!state?.url) {
      navigate("/", { replace: true });
    }
    return () => {
      // cleanup
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch (e) {}
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!state) return null;
  const { url, meta, options } = state;

  const goBack = () => {
    if (
      status === "downloading" ||
      status === "downloading" ||
      status === "polling"
    ) {
      handleCancel();
    }
    window.history.back();
  };

  // util: pretty bytes
  function humanFileSize(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    return (
      (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2) + " " + sizes[i]
    );
  }

  // smooth growth helper (used while downloading)
  function growTo(percent, ms = 400) {
    setProgress((p) => Math.max(p, 2));
    let t = setInterval(() => {
      setProgress((p) => {
        if (p >= percent) {
          clearInterval(t);
          return p;
        }
        const next = p + Math.max(0.5, (percent - p) * 0.12);
        return Math.min(next, percent);
      });
    }, ms);
    return t;
  }

  // polling until server file exists (HEAD returns 200)
  // --- REPLACE the old waitForFileReady with this function ---
  function waitForFileReady(urlToCheck, maxAttempts = 30, intervalMs = 1000) {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      // Setup polling visual parameters
      const pollBase = Math.max(2, Math.round(progress)); // start from current progress
      const pollTarget = 85; // how far polling phase can advance the bar (50..100 range)
      const totalDuration = Math.max(1, maxAttempts * intervalMs); // ms
      const visualTickMs = 250; // update visual progress every 250ms

      // clear previous polling timer if any
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }

      const startTime = Date.now();

      // Visual progress timer — runs frequently and independently of HEAD calls
      pollingRef.current = setInterval(() => {
        try {
          const elapsed = Date.now() - startTime;
          const frac = Math.min(1, elapsed / totalDuration);
          const targetProgress = Math.round(
            pollBase + frac * (pollTarget - pollBase)
          );
          setProgress((p) => Math.max(p, targetProgress));
        } catch (e) {
          // ignore any setState issues
        }
      }, visualTickMs);

      // Async HEAD polling loop (doesn't block visual timer)
      (async () => {
        try {
          while (attempts < maxAttempts) {
            // if cancelled, stop
            if (abortControllerRef.current?.signal?.aborted) {
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
              }
              return reject(new Error("Polling cancelled"));
            }

            try {
              const head = await fetch(urlToCheck, { method: "HEAD" });
              if (head.status === 200) {
                const cl = head.headers.get("content-length");
                const ct = head.headers.get("content-type");
                // stop visual timer
                if (pollingRef.current) {
                  clearInterval(pollingRef.current);
                  pollingRef.current = null;
                }
                // ensure progress jumps forward to pollTarget before resolving
                setProgress((p) => Math.max(p, pollTarget));
                return resolve({
                  size: cl ? parseInt(cl, 10) : 0,
                  contentType: ct || "",
                });
              }
            } catch (err) {
              // network blip — we'll continue and retry
            }

            attempts += 1;
            // wait intervalMs between tries (non-blocking)
            await new Promise((r) => setTimeout(r, intervalMs));
          }

          // timed out
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          return reject(new Error("File not ready after waiting"));
        } catch (err) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          return reject(err);
        }
      })();
    });
  }

  // map content-type to extension fallback
  function extFromContentType(contentType, fallbackName) {
    if (!contentType) {
      // fallback to filename extension
      const m = fallbackName?.match(/\.([a-z0-9]+)$/i);
      return m ? m[1] : "mp4";
    }
    const ct = contentType.split(";")[0].trim().toLowerCase();
    if (ct.includes("mp4") || ct.includes("mpeg") || ct.includes("x-mpeg"))
      return "mp4";
    if (ct.includes("webm")) return "webm";
    if (ct.includes("ogg")) return "ogg";
    if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3";
    if (ct.includes("wav")) return "wav";
    if (ct.includes("matroska") || ct.includes("x-matroska")) return "mkv";
    // default
    const m = fallbackName?.match(/\.([a-z0-9]+)$/i);
    return m ? m[1] : "mp4";
  }

  // Cancel handler
  function handleCancel() {
    try {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    } catch (e) {}
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setStatus("cancelled");
    setMessage("Cancelled by user.");
  }

  // Main routine
  async function handlePrepareAndDownload() {
    // reset
    setError("");
    setMessage("");
    setProgress(2);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setSpeed(0);

    setStatus("downloading");
    setMessage("Your video will be downloaded in your Downloads folder");

    const preparer = growTo(30, 400);

    try {
      // ask backend to prepare
      const payload = {
        url,
        type: options.type,
        format: options.format,
        quality: options.quality,
      };
      const res = await axios.post(`${BASE_URL}/download`, payload, {
        timeout: 0,
      });

      clearInterval(preparer);
      setProgress(35);

      if (!res?.data?.downloadUrl) {
        throw new Error("Server response missing downloadUrl");
      }

      setDownloadUrl(res.data.downloadUrl);
      const serverFilename =
        res.data.filename ||
        `video.${options.format === "mp3" ? "mp3" : "mp4"}`;
      setFilename(serverFilename);
      setStatus("polling");
      setMessage("Finalizing file on server — waiting for availability...");

      // create abort controller for polling & later download
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch (e) {}
      }
      abortControllerRef.current = new AbortController();

      // wait for file ready (HEAD returns 200) and retrieve size & content-type
      let headInfo = { size: 0, contentType: "" };
      try {
        headInfo = await waitForFileReady(res.data.downloadUrl, 30, 1000); // wait up to ~30s
      } catch (pollErr) {
        // allowed: if poll fails, we'll still attempt download once below,
        // but we must ensure we don't save HTML errors: we'll check content-type on GET
        console.warn("Polling timed out / failed:", pollErr);
      }

      setTotalBytes(headInfo.size || 0);
      setProgress(45);

      // Determine extension & content-type from HEAD (if available)
      const finalExt = extFromContentType(headInfo.contentType, serverFilename);

      // Now fetch the actual file (stream) and save
      setStatus("downloading");
      setMessage("Downloading...");
      setProgress(50);

      // new abort controller for download
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch (e) {}
      }
      abortControllerRef.current = new AbortController();

      const downloadStart = Date.now();
      let lastLoaded = 0;
      let lastTime = downloadStart;

      // Use fetch streaming (works well in modern browsers)
      const response = await fetch(res.data.downloadUrl, {
        signal: abortControllerRef.current.signal,
      });
      if (!response.ok) {
        // server returned an error page or something else
        const text = await response.text().catch(() => "");
        throw new Error(
          `Download request failed: ${response.status} ${
            response.statusText
          }. Server message: ${text.slice(0, 500)}`
        );
      }

      // check content-type — if HTML/text, abort and surface error
      const respContentType = response.headers.get("content-type") || "";
      if (respContentType.toLowerCase().includes("text/html")) {
        // likely an error HTML page, don't save it
        const txt = await response.text().catch(() => "No server message.");
        throw new Error(
          `Server returned an HTML error page instead of file. Message: ${txt.slice(
            0,
            500
          )}`
        );
      }

      // get content length if provided
      const respContentLength = response.headers.get("content-length");
      const total = respContentLength
        ? parseInt(respContentLength, 10)
        : headInfo.size || 0;
      if (total) setTotalBytes(total);

      // determine final filename and extension
      const respExt = extFromContentType(respContentType, serverFilename);
      let downloadName = serverFilename;
      if (!downloadName.includes(".")) {
        downloadName = `${downloadName}.${respExt}`;
      } else {
        // ensure extension matches response if mismatch (replace)
        const curExt = downloadName.split(".").pop();
        if (curExt.toLowerCase() !== respExt.toLowerCase()) {
          downloadName = downloadName.replace(/\.[^.]+$/, `.${respExt}`);
        }
      }
      setFilename(downloadName);

      // stream and collect chunks
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        setDownloadedBytes(received);

        // update speed
        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        if (dt > 0.25) {
          const bytes = received - lastLoaded;
          const s = bytes / dt;
          setSpeed(s);
          lastLoaded = received;
          lastTime = now;
        }

        // progress mapping (download portion 50..100)
        if (total && total > 0) {
          const dlPct = Math.min(100, Math.round((received / total) * 100));
          const globalPct = Math.round(50 + dlPct * 0.5); // 50..100
          setProgress(globalPct);
        } else {
          // no total known: increment gently
          setProgress((p) => Math.min(99, p + 0.2));
        }
      }

      // assemble blob with correct MIME (or fallback)
      const mime = respContentType || "application/octet-stream";
      const blob = new Blob(chunks, { type: mime });

      // create URL and trigger download with correct filename
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);

      setProgress(100);
      setStatus("done");
      setMessage("Download complete — check your Downloads folder.");
      setSpeed(0);
    } catch (err) {
      console.error("prepare/download error:", err);
      if (
        err?.name === "AbortError" ||
        err?.message?.toLowerCase().includes("aborted") ||
        err?.message?.toLowerCase().includes("cancelled")
      ) {
        setStatus("cancelled");
        setMessage("Cancelled by user.");
      } else {
        setStatus("error");
        const details = err?.message || String(err);
        setError(details);
        setMessage("");
      }
    } finally {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
  }

  // Reusable animation variant
  const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
  };

  return (
    <div className="min-h-screen bg-black text-white flex justify-center">
      <div className="w-full max-w-[420px] px-4 py-4">
        {/* Back row */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="flex items-center gap-3"
        >
          <button
            onClick={goBack}
            aria-label="back"
            className="p-1 flex items-center gap-1 font-bold text-lg"
          >
            <FaArrowLeft /> Back
          </button>
        </motion.div>

        {/* Content */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-20 text-center"
        >
          <h1 className="text-white text-[20px] font-bold leading-[28px] px-12">
            Your video is ready for downloading!
          </h1>
          <p className="mt-3 text-[14px] text-gray-400 ">
            {message || "Click Prepare & Download to start."}
          </p>

          <motion.button
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            onClick={handlePrepareAndDownload}
            disabled={
              status === "downloading" ||
              status === "polling" ||
              status === "downloading"
            }
            className={`w-full px-6 py-3 mt-7 rounded-[7px] ${
              status === "downloading" ||
              status === "polling" ||
              status === "downloading"
                ? "bg-[#1d9fbf] cursor-wait"
                : "bg-[#3AC1FF] hover:bg-[#1ba9eb]"
            } transition-all text-white font-semibold`}
          >
            {status === "downloading" || status === "polling"
              ? "Downloading..."
              : status === "downloading"
              ? "Downloading…"
              : "Download Video"}
          </motion.button>

          {/* Cancel button visible while working */}
          {(status === "downloading" ||
            status === "polling" ||
            status === "downloading") && (
            <button
              onClick={handleCancel}
              className="w-full mt-3 px-6 py-2 rounded-[7px] bg-[#333] text-sm text-white"
            >
              Cancel
            </button>
          )}
        </motion.div>

        {/* Preview image block */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-6 overflow-hidden"
        >
          <img
            src={
              meta?.thumbnail ||
              "https://i.pinimg.com/736x/c1/50/94/c15094988478aba334dc378676cabe0c.jpg"
            }
            alt="video preview"
            className="w-full h-[233px] object-cover block"
          />
        </motion.div>

        {/* format + icon row */}
        <motion.div
          variants={{
            hidden: { opacity: 0, scale: 0.8 },
            visible: { opacity: 1, scale: 1, transition: { duration: 0.5 } },
          }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-10 flex items-center gap-3 justify-center"
        >
          <div className="w-[44px] h-[33px] border border-gray-400 rounded-[8px] flex items-center justify-center text-sm">
            <FaPlay />
          </div>
          <div className="text-white font-semibold text-[16px]">
            {(options?.format || "MP4").toUpperCase()} {options?.quality || ""}
          </div>
        </motion.div>

        {/* PROGRESS block */}
        <div className="mt-6 px-2">
          <div className="text-xs text-slate-400 mb-2">
            {status === "idle" && "Click Download Video button to begin."}
            {status === "downloading" && `Downloading: ${message}`}
            {status === "polling" && `Waiting for server...`}
            {status === "ready" && `Ready — starting download.`}
            {status === "downloading" &&
              `Downloading: ${humanFileSize(downloadedBytes)}${
                totalBytes ? ` / ${humanFileSize(totalBytes)}` : ""
              } ${speed ? `• ${humanFileSize(Math.round(speed))}/s` : ""}`}
            {status === "done" && "Download finished."}
            {status === "cancelled" && "Cancelled."}
            {status === "error" && `Error: ${error}`}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-[#111] h-3 rounded overflow-hidden">
            <div
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              className={`h-full transition-all duration-300 ${
                progress === 100 ? "bg-green-500" : "bg-[#3AC1FF]"
              }`}
            ></div>
          </div>

          {/* additional info */}
          <div className="mt-2 text-xs text-slate-400 flex justify-between">
            <div>{Math.round(progress)}%</div>
            <div>
              {totalBytes
                ? humanFileSize(totalBytes)
                : downloadUrl
                ? "Size: unknown"
                : ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
