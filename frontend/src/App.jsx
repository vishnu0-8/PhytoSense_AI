import { useState, useEffect, useCallback, useRef } from "react";

import {
  LayoutDashboard,
  ScanSearch,
  Bot,
  History,
  Sprout,
  BrainCircuit,
  Settings,
  Bell,
  Plus,
  Search,
  Leaf,
  Activity,
  ShieldCheck,
  TrendingUp,
  ArrowUpRight,
  CloudSun,
  Droplets,
  Wind,
  Menu,
  ChevronDown,
  Upload,
  Camera,
  X,
} from "lucide-react";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";


// Set VITE_API_URL in the frontend hosting environment for production.
// Local development retains the same-host backend URL and cookie behavior.
const API_HOST = window.location.hostname || "127.0.0.1";
const API_PROTOCOL = window.location.protocol === "https:" ? "https:" : "http:";
const LOCAL_API_URL = `${API_PROTOCOL}//${API_HOST}:8000`;
// In production, use same-origin /api paths routed by vercel.json.
// This lets the browser store/send the HttpOnly session cookie on the Vercel domain.
const API_URL = import.meta.env.PROD
  ? ""
  : (import.meta.env.VITE_API_URL || LOCAL_API_URL).replace(/\/$/, "");

// Include the HTTP-only session cookie only for PlantAI API requests.
// External services (for example Open-Meteo) must not receive credentials,
// because many public APIs use Access-Control-Allow-Origin: *.
const apiFetch = (input, init = {}) => {
  const requestUrl = new URL(input, window.location.href);
  const apiOrigin = import.meta.env.PROD
    ? window.location.origin
    : new URL(API_URL).origin;
  const isPlantApiRequest = requestUrl.origin === apiOrigin;

  return globalThis.fetch(input, {
    ...init,
    credentials: isPlantApiRequest ? "include" : "omit",
  });
};


// ======================================================
// SIDEBAR ITEMS
// ======================================================

const sidebarItems = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Disease Detection", icon: ScanSearch },
  { name: "AI Assistant", icon: Bot },
  { name: "Detection History", icon: History },
  { name: "Notifications", icon: Bell },
  { name: "Reports & Export", icon: Activity },
  { name: "Disease Library", icon: Sprout },
  { name: "Model Information", icon: BrainCircuit },
  { name: "Settings", icon: Settings },
];


// ======================================================
// DEMONSTRATION CHART DATA
// ======================================================

const weeklyData = [
  { day: "Mon", detections: 12 },
  { day: "Tue", detections: 19 },
  { day: "Wed", detections: 15 },
  { day: "Thu", detections: 27 },
  { day: "Fri", detections: 21 },
  { day: "Sat", detections: 32 },
  { day: "Sun", detections: 25 },
];

const diseaseData = [
  { name: "Healthy", value: 45 },
  { name: "Early Blight", value: 25 },
  { name: "Late Blight", value: 18 },
  { name: "Other", value: 12 },
];

const COLORS = [
  "#8bcf76",
  "#e5c75b",
  "#e58b61",
  "#6caa91",
  "#8f9fe8",
  "#c18be0",
  "#d58d9b",
  "#78b9c7",
];


// ======================================================
// WEATHER CONDITION
// ======================================================

function getWeatherCondition(code) {

  if (code === 0)
    return { label: "Clear Sky", icon: "☀️" };

  if ([1, 2].includes(code))
    return { label: "Partly Cloudy", icon: "🌤️" };

  if (code === 3)
    return { label: "Overcast", icon: "☁️" };

  if ([45, 48].includes(code))
    return { label: "Foggy", icon: "🌫️" };

  if ([51, 53, 55, 56, 57].includes(code))
    return { label: "Drizzle", icon: "🌦️" };

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return { label: "Rainy", icon: "🌧️" };

  if ([71, 73, 75, 77, 85, 86].includes(code))
    return { label: "Snowy", icon: "❄️" };

  if ([95, 96, 99].includes(code))
    return { label: "Thunderstorm", icon: "⛈️" };

  return { label: "Unknown", icon: "🌡️" };
}



// ======================================================
// DISEASE DETECTION PAGE
// ======================================================


function RecommendationValue({ value }) {
  if (value === null || value === undefined || value === "") return null;

  if (Array.isArray(value)) {
    return (
      <ul style={{ margin: 0, paddingLeft: 19, color: "#c6d5c9", lineHeight: 1.7 }}>
        {value.map((item, index) => (
          <li key={index} style={{ marginBottom: 7 }}>
            {typeof item === "object" && item !== null
              ? <RecommendationValue value={item} />
              : String(item)}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <strong style={{ color: "#e1f0e3", textTransform: "capitalize", fontSize: 13 }}>
              {key.replaceAll("_", " ")}
            </strong>
            <div style={{ color: "#c6d5c9", fontSize: 13, lineHeight: 1.65, marginTop: 3 }}>
              {key.toLowerCase() === "url" && typeof item === "string" ? (
                <a href={item} target="_blank" rel="noreferrer" style={{ color: "#a8e99a", overflowWrap: "anywhere" }}>
                  Open source ↗
                </a>
              ) : (
                <RecommendationValue value={item} />
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

function DiseaseDetectionPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  };

  const openCamera = async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported in this browser. Use localhost or HTTPS, or choose an image from your device.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
      // Wait for the camera dialog/video element to render before attaching the stream.
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (cameraErr) {
      console.error("Camera access error:", cameraErr);
      const message = cameraErr.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access in your browser settings and try again."
        : cameraErr.name === "NotFoundError"
          ? "No camera was found on this device. You can upload an image instead."
          : "Unable to start the camera. Check that another app is not using it.";
      setCameraError(message);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError("Camera is not ready yet. Please wait a moment and try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError("Could not capture the photo. Please try again.");
        return;
      }
      const photo = new File([blob], `plant-camera-${Date.now()}.jpg`, { type: "image/jpeg" });
      handleFile(photo);
      stopCamera();
    }, "image/jpeg", 0.92);
  };

  const handleFile = (file) => {
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please select a JPG, PNG or WEBP image.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image size must be smaller than 10 MB.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setError("");
  };

  const analyzeImage = async () => {
    if (!selectedFile) {
      setError("Please choose a plant leaf image first.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await apiFetch(`${API_URL}/api/detect`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || `Disease detection failed (HTTP ${response.status}). The backend may be unavailable.`
        );
      }

      setResult(data);
      try {
        localStorage.setItem("plantai_latest_detection", JSON.stringify({
          crop: data.prediction?.crop || "Unknown crop",
          disease: data.prediction?.disease || data.prediction?.label || "Not yet diagnosed",
          confidence: Number(data.prediction?.confidence || 0),
        }));
      } catch (storageError) {
        console.warn("Could not save latest detection context:", storageError);
      }
    } catch (err) {
      setError(err.message || "Unable to connect to the PlantAI backend.");
    } finally {
      setLoading(false);
    }
  };

  const resetDetection = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl("");
    setResult(null);
    setError("");
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [previewUrl]);

  const recommendationEntries = result?.recommendations
    ? Object.entries(result.recommendations).filter(
        ([key, value]) =>
          !["crop", "disease"].includes(key) &&
          value !== null &&
          value !== undefined &&
          value !== ""
      )
    : [];

  return (
    <section style={{ paddingBottom: 32 }}>
      <div className="welcome-section">
        <div>
          <p className="eyebrow">AI-POWERED PLANT DIAGNOSIS</p>
          <h1>Plant Disease <span>Detection</span></h1>
          <p className="welcome-subtitle">
            Upload a clear leaf image and let your trained AI model analyse it.
          </p>
        </div>
        <div className="date-badge">
          <ShieldCheck size={16} />
          ResNet18 · 38 Classes
        </div>
      </div>

      <div
        className="glass-card"
        style={{
          padding: 24,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 24,
          alignItems: "start",
        }}
      >
        <div>
          <div className="card-heading">
            <div>
              <h3>Upload Leaf Image</h3>
              <p>JPG, PNG or WEBP · Maximum 10 MB</p>
            </div>
            <Upload size={21} />
          </div>

          <label
            htmlFor="plant-image-upload"
            style={{
              minHeight: 260,
              border: "1px dashed rgba(157, 225, 139, .55)",
              borderRadius: 16,
              background: "rgba(10, 35, 23, .48)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              textAlign: "center",
              cursor: "pointer",
              overflow: "hidden",
            }}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Selected plant leaf"
                style={{
                  width: "100%",
                  maxHeight: 300,
                  objectFit: "contain",
                  borderRadius: 12,
                }}
              />
            ) : (
              <>
                <div className="leaf-placeholder">
                  <Leaf size={38} />
                </div>
                <h3 style={{ marginTop: 16 }}>Choose a plant image</h3>
                <p style={{ color: "#b0c3b5", marginTop: 8 }}>
                  Click here to browse an image from your device.
                </p>
              </>
            )}
            <input
              id="plant-image-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => handleFile(event.target.files?.[0])}
              style={{ display: "none" }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 13 }}>
            <button
              type="button"
              onClick={openCamera}
              style={{
                border: "1px solid rgba(157,225,139,.45)",
                borderRadius: 10,
                padding: "11px 16px",
                color: "#e6f1e8",
                background: "rgba(157,225,139,.09)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Camera size={17} /> Take Photo with Camera
            </button>
          </div>

          {cameraError && !cameraOpen && (
            <div role="alert" style={{ color: "#ffaaa0", fontSize: 13, marginTop: 10 }}>
              {cameraError}
            </div>
          )}

          {selectedFile && (
            <p style={{ color: "#b0c3b5", fontSize: 13, marginTop: 10 }}>
              Selected: {selectedFile.name}
            </p>
          )}

          {error && (
            <div
              role="alert"
              style={{
                color: "#ffaaa0",
                background: "rgba(150, 45, 35, .16)",
                border: "1px solid rgba(255, 130, 110, .35)",
                borderRadius: 10,
                padding: 12,
                marginTop: 14,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
            <button
              onClick={analyzeImage}
              disabled={!selectedFile || loading}
              style={{
                border: 0,
                borderRadius: 10,
                padding: "12px 20px",
                background: !selectedFile || loading ? "#536b58" : "#9de18b",
                color: "#10251a",
                fontWeight: 700,
                cursor: !selectedFile || loading ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
              }}
            >
              <ScanSearch size={17} />
              {loading ? "Analysing image..." : "Analyse Plant"}
            </button>

            <button
              onClick={resetDetection}
              style={{
                border: "1px solid rgba(190, 220, 195, .3)",
                borderRadius: 10,
                padding: "12px 18px",
                color: "#e6f1e8",
                background: "rgba(255,255,255,.05)",
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div>
          <div className="card-heading">
            <div>
              <h3>How it works</h3>
              <p>Your image is analysed by the local model.</p>
            </div>
            <BrainCircuit size={21} />
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {[
              ["01", "Image upload", "Choose a clear image of a single plant leaf."],
              ["02", "AI analysis", "ResNet18 predicts the most likely class."],
              ["03", "Visual explanation", "Grad-CAM highlights influential image regions."],
              ["04", "Recommendations", "Review the available crop and disease guidance."],
            ].map(([number, title, description]) => (
              <div
                key={number}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: 14,
                  borderRadius: 12,
                  background: "rgba(255,255,255,.045)",
                }}
              >
                <strong style={{ color: "#9de18b", fontSize: 18 }}>{number}</strong>
                <div>
                  <h4 style={{ margin: "0 0 5px" }}>{title}</h4>
                  <p style={{ color: "#b0c3b5", margin: 0, fontSize: 13 }}>
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="glass-card" style={{ marginTop: 22, padding: 22 }}>
          Analysing your image. This may take a few seconds...
        </div>
      )}

      {result && (
        <div style={{ display: "grid", gap: 20, marginTop: 22 }}>
          <div className="glass-card" style={{ padding: 24 }}>
            <div className="card-heading">
              <div>
                <h3>Detection Result</h3>
                <p>Prediction generated by your trained model</p>
              </div>
              <ShieldCheck size={22} />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 14,
                marginTop: 18,
              }}
            >
              {[
                ["Crop", result.prediction?.crop],
                ["Predicted class", result.prediction?.label],
                ["Confidence", `${result.prediction?.confidence ?? 0}%`],
                ["Plant status", result.prediction?.healthy ? "Healthy" : "Potential disease detected"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    background: "rgba(255,255,255,.05)",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <p style={{ color: "#b0c3b5", fontSize: 13, margin: 0 }}>{label}</p>
                  <h3 style={{ margin: "8px 0 0", overflowWrap: "anywhere" }}>
                    {value || "Not available"}
                  </h3>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            <div className="glass-card" style={{ padding: 22 }}>
              <div className="card-heading">
                <div>
                  <h3>Grad-CAM Explanation</h3>
                  <p>Highlighted regions that influenced the prediction</p>
                </div>
              </div>
              {result.gradcam_image ? (
                <img
                  src={result.gradcam_image}
                  alt="Grad-CAM heatmap"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    marginTop: 16,
                    objectFit: "contain",
                    background: "#0b1e14",
                  }}
                />
              ) : (
                <p style={{ color: "#b0c3b5" }}>Grad-CAM image was not returned.</p>
              )}
            </div>

            <div className="glass-card" style={{ padding: 22 }}>
              <div className="card-heading">
                <div>
                  <h3>Top 5 Predictions</h3>
                  <p>Model confidence by class</p>
                </div>
                <Activity size={20} />
              </div>
              <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
                {(result.top_predictions || []).map((item, index) => (
                  <div key={`${item.disease}-${index}`}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        marginBottom: 7,
                      }}
                    >
                      <span style={{ fontSize: 13 }}>{item.label || item.disease}</span>
                      <strong style={{ color: "#9de18b" }}>{item.confidence}%</strong>
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 20,
                        background: "rgba(255,255,255,.1)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, item.confidence || 0))}%`,
                          height: "100%",
                          borderRadius: 20,
                          background: "#9de18b",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 22 }}>
            <div className="card-heading">
              <div>
                <h3>Care & Treatment Recommendations</h3>
                <p>Guidance returned by the project's recommendation knowledge base</p>
              </div>
              <Sprout size={21} />
            </div>

            {recommendationEntries.length ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 14,
                  marginTop: 16,
                }}
              >
                {recommendationEntries.map(([key, value]) => (
                  <div
                    key={key}
                    style={{
                      background: "rgba(255,255,255,.045)",
                      border: "1px solid rgba(157,225,139,.12)",
                      borderRadius: 12,
                      padding: 15,
                      minWidth: 0,
                    }}
                  >
                    <h4 style={{ margin: "0 0 8px", textTransform: "capitalize" }}>
                      {key.replaceAll("_", " ")}
                    </h4>
                    <div style={{ color: "#c6d5c9", fontSize: 13, lineHeight: 1.65 }}>
                      <RecommendationValue value={value} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#b0c3b5", marginTop: 16 }}>
                No additional recommendation details were returned for this class.
              </p>
            )}
          </div>

          <p style={{ color: "#b0c3b5", fontSize: 12, lineHeight: 1.6 }}>
            AI predictions are decision-support information, not a substitute for
            field inspection or expert agricultural advice. Confirm uncertain
            results before taking treatment action.
          </p>
        </div>
      )}

      {cameraOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Take a plant photo"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,.78)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div className="glass-card" style={{ width: "min(720px, 100%)", padding: 20, background: "#102e20" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0 }}>Capture Plant Image</h3>
                <p style={{ color: "#b0c3b5", margin: "5px 0 0", fontSize: 13 }}>Position the leaf clearly inside the camera frame.</p>
              </div>
              <button type="button" onClick={stopCamera} aria-label="Close camera" style={{ border: 0, color: "#e6f1e8", background: "rgba(255,255,255,.08)", borderRadius: 9, padding: 9, cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: "100%", maxHeight: "60vh", objectFit: "contain", background: "#06140d", borderRadius: 12 }}
            />

            {cameraError && <p role="alert" style={{ color: "#ffaaa0", fontSize: 13 }}>{cameraError}</p>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", marginTop: 15 }}>
              <button type="button" onClick={stopCamera} style={{ border: "1px solid rgba(190,220,195,.3)", borderRadius: 10, padding: "11px 16px", color: "#e6f1e8", background: "rgba(255,255,255,.05)", cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={capturePhoto} style={{ border: 0, borderRadius: 10, padding: "11px 18px", color: "#10251a", background: "#9de18b", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Camera size={17} /> Capture Photo
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}



// ======================================================
// DETECTION HISTORY PAGE
// ======================================================

function DetectionHistoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`${API_URL}/api/history`);
      if (!response.ok) throw new Error("Could not load detection history.");
      const data = await response.json();
      setItems(Array.isArray(data.history) ? data.history : []);
    } catch (err) {
      setError(err.message || "Unable to connect to the backend.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filteredItems = items.filter((item) => {
    const text = `${item.crop || ""} ${item.disease || ""}`.toLowerCase();
    const matchesQuery = text.includes(query.toLowerCase());
    const healthy = String(item.disease || "").toLowerCase().includes("healthy");
    const matchesFilter = filter === "all" || (filter === "healthy" ? healthy : !healthy);
    return matchesQuery && matchesFilter;
  });

  const healthyCount = items.filter((item) =>
    String(item.disease || "").toLowerCase().includes("healthy")
  ).length;

  const formatDate = (value) => {
    if (!value) return "Date unavailable";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  };

  return (
    <section style={{ padding: "28px 0 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <p className="eyebrow">YOUR ANALYSIS RECORDS</p>
          <h1 style={{ color: "#eff8ef", margin: "8px 0" }}>Detection History</h1>
          <p style={{ color: "#b0c3b5", margin: 0 }}>Review previous plant disease predictions saved by PlantAI.</p>
        </div>
        <button onClick={loadHistory} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: 9, border: "1px solid #52765b", borderRadius: 12, padding: "11px 16px", background: "#234a32", color: "#e8f5e8", cursor: "pointer" }}>
          <span style={{ fontSize: 17 }}>↻</span>{loading ? "Refreshing..." : "Refresh history"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 22 }}>
        <div className="glass-card" style={{ padding: 20 }}><p style={{ color: "#b0c3b5", margin: 0 }}>Total analyses</p><h2 style={{ color: "#f1f8f1", fontSize: 30, margin: "8px 0 0" }}>{items.length}</h2></div>
        <div className="glass-card" style={{ padding: 20 }}><p style={{ color: "#b0c3b5", margin: 0 }}>Healthy results</p><h2 style={{ color: "#9de18b", fontSize: 30, margin: "8px 0 0" }}>{healthyCount}</h2></div>
        <div className="glass-card" style={{ padding: 20 }}><p style={{ color: "#b0c3b5", margin: 0 }}>Disease detected</p><h2 style={{ color: "#f0b27e", fontSize: 30, margin: "8px 0 0" }}>{items.length - healthyCount}</h2></div>
      </div>

      <div className="glass-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ flex: "1 1 240px", display: "flex", alignItems: "center", gap: 10, background: "rgba(5,25,15,.35)", border: "1px solid rgba(170,210,175,.18)", borderRadius: 10, padding: "0 12px" }}>
            <Search size={17} color="#a9c6ad" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search crop or disease..." style={{ width: "100%", padding: "12px 0", border: 0, outline: 0, color: "#edf7ed", background: "transparent" }} />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ minWidth: 155, padding: "11px 13px", borderRadius: 10, border: "1px solid rgba(170,210,175,.22)", background: "#183b28", color: "#eaf5eb" }}>
            <option value="all">All results</option>
            <option value="healthy">Healthy only</option>
            <option value="diseased">Diseased only</option>
          </select>
        </div>

        {loading ? (
          <p style={{ color: "#c6d5c9", padding: 24, textAlign: "center" }}>Loading your detection records...</p>
        ) : error ? (
          <div style={{ padding: 22, textAlign: "center", color: "#ffb5a9" }}>{error}<div><button onClick={loadHistory} style={{ marginTop: 12, padding: "9px 14px", borderRadius: 9, border: 0, background: "#315b3d", color: "white", cursor: "pointer" }}>Try again</button></div></div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: 34, textAlign: "center", color: "#b0c3b5" }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🌿</div>
            <h3 style={{ color: "#e8f3e9", margin: "0 0 7px" }}>{items.length ? "No matching records" : "No detections yet"}</h3>
            <p style={{ margin: 0 }}>{items.length ? "Try changing your search or filter." : "Your completed plant analyses will appear here."}</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650, color: "#e8f3e9" }}>
              <thead><tr style={{ textAlign: "left", color: "#a9c6ad", borderBottom: "1px solid rgba(170,210,175,.2)" }}>
                { ["Crop", "Prediction", "Confidence", "Date & time", "Status"].map((heading) => <th key={heading} style={{ padding: "13px 12px", fontSize: 12, fontWeight: 600 }}>{heading}</th>) }
              </tr></thead>
              <tbody>
                {filteredItems.map((item, index) => {
                  const healthy = String(item.disease || "").toLowerCase().includes("healthy");
                  const confidence = Number(item.confidence);
                  return <tr key={`${item.timestamp || "record"}-${index}`} style={{ borderBottom: "1px solid rgba(170,210,175,.11)" }}>
                    <td style={{ padding: "15px 12px", textTransform: "capitalize" }}>{item.crop || "Unknown"}</td>
                    <td style={{ padding: "15px 12px", fontWeight: 600 }}>{String(item.disease || "Unknown").replaceAll("___", " — ").replaceAll("_", " ")}</td>
                    <td style={{ padding: "15px 12px" }}>{Number.isFinite(confidence) ? `${confidence.toFixed(1)}%` : "—"}</td>
                    <td style={{ padding: "15px 12px", color: "#b0c3b5", fontSize: 13 }}>{formatDate(item.timestamp)}</td>
                    <td style={{ padding: "15px 12px" }}><span style={{ display: "inline-block", borderRadius: 20, padding: "5px 10px", fontSize: 12, color: healthy ? "#a9e99c" : "#ffd0a6", background: healthy ? "rgba(91,170,91,.16)" : "rgba(215,139,75,.15)" }}>{healthy ? "Healthy" : "Disease"}</span></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ color: "#8fa997", fontSize: 12, margin: "16px 0 0" }}>Showing {filteredItems.length} of {items.length} saved records. The history API currently returns up to 100 recent detections.</p>
      </div>
    </section>
  );
}


// ======================================================
// GROQ AI ASSISTANT PAGE
// ======================================================

function AIAssistantPage({ defaultLanguage = "English" }) {
  const [languages, setLanguages] = useState(["English", "Hindi", "Hinglish", "Bhojpuri", "Bengali", "Marathi", "Punjabi", "Tamil", "Telugu"]);
  const [language, setLanguage] = useState(defaultLanguage);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const response = await apiFetch(`${API_URL}/api/conversations`);
      if (!response.ok) throw new Error("Could not load conversation history.");
      const data = await response.json();
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
    } catch (err) {
      setError(err.message || "Unable to load conversations.");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [languageResponse, conversationResponse] = await Promise.all([
          apiFetch(`${API_URL}/api/chat/languages`),
          apiFetch(`${API_URL}/api/conversations`),
        ]);
        if (!languageResponse.ok || !conversationResponse.ok) {
          throw new Error("Unable to connect to the AI Assistant backend.");
        }
        const languageData = await languageResponse.json();
        const conversationData = await conversationResponse.json();
        if (!mounted) return;
        if (Array.isArray(languageData.languages)) setLanguages(languageData.languages);
        setConversations(Array.isArray(conversationData.conversations) ? conversationData.conversations : []);
      } catch (err) {
        if (mounted) setError(err.message || "Unable to load the AI Assistant.");
      } finally {
        if (mounted) setPageLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const startConversation = async () => {
    setLoading(true);
    setError("");
    try {
      let context = { crop: "Unknown crop", disease: "Not yet diagnosed", confidence: 0 };
      try {
        const saved = localStorage.getItem("plantai_latest_detection");
        if (saved) context = { ...context, ...JSON.parse(saved) };
      } catch (_) {}

      const response = await apiFetch(`${API_URL}/api/chat/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...context, language }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not start the AI conversation.");
      setConversationId(data.conversation_id);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      await loadConversations();
    } catch (err) {
      setError(err.message || "Unable to start conversation.");
    } finally {
      setLoading(false);
    }
  };

  const openConversation = async (id) => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`${API_URL}/api/chat/${id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not open this conversation.");
      setConversationId(id);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setLanguage(data.conversation?.language || "English");
    } catch (err) {
      setError(err.message || "Unable to open conversation.");
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (event) => {
    event?.preventDefault();
    const message = input.trim();
    if (!message || !conversationId || loading) return;
    setInput("");
    setError("");
    setMessages((current) => [...current, { role: "user", message }]);
    setLoading(true);
    try {
      const response = await apiFetch(`${API_URL}/api/chat/${conversationId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "The AI could not respond.");
      setMessages(Array.isArray(data.messages) ? data.messages : (current => current));
      await loadConversations();
    } catch (err) {
      setError(err.message || "Unable to send message.");
      // Keep the user's message visible so it can be retried or copied.
    } finally {
      setLoading(false);
    }
  };

  const changeLanguage = async (nextLanguage) => {
    setLanguage(nextLanguage);
    if (!conversationId) return;
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`${API_URL}/api/chat/${conversationId}/language`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: nextLanguage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not change language.");
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      await loadConversations();
    } catch (err) {
      setError(err.message || "Unable to change language.");
    } finally {
      setLoading(false);
    }
  };

  const deleteConversation = async (id) => {
    if (!window.confirm("Delete this conversation and its messages?")) return;
    try {
      const response = await apiFetch(`${API_URL}/api/chat/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not delete conversation.");
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }
      await loadConversations();
    } catch (err) {
      setError(err.message || "Unable to delete conversation.");
    }
  };

  const panelStyle = { background: "rgba(10,35,23,.72)", border: "1px solid rgba(157,225,139,.16)", borderRadius: 14 };
  const buttonStyle = { border: "1px solid rgba(157,225,139,.35)", borderRadius: 9, padding: "9px 12px", color: "#e6f1e8", background: "rgba(157,225,139,.09)", cursor: "pointer" };

  return (
    <section style={{ padding: "26px 0 36px" }}>
      <div className="welcome-section">
        <div>
          <p className="eyebrow">GROQ-POWERED AGRICULTURE ASSISTANT</p>
          <h1>AI Plant <span>Assistant</span></h1>
          <p className="welcome-subtitle">Ask questions about plant diseases, symptoms, prevention and care.</p>
        </div>
        <div className="date-badge"><Bot size={16} /> PlantAI Assistant</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)", gap: 18, alignItems: "stretch" }}>
        <aside className="glass-card" style={{ padding: 16, minWidth: 0 }}>
          <button onClick={() => { setConversationId(null); setMessages([]); setError(""); }} style={{ ...buttonStyle, width: "100%", marginBottom: 10 }}>
            + New conversation
          </button>
          <h3 style={{ color: "#e8f3e9", fontSize: 14, margin: "15px 0 10px" }}>Recent conversations</h3>
          <div style={{ display: "grid", gap: 8, maxHeight: 460, overflowY: "auto" }}>
            {conversations.length === 0 && <p style={{ color: "#9fb5a4", fontSize: 13 }}>No saved conversations yet.</p>}
            {conversations.map((chat) => (
              <div key={chat.id} style={{ ...panelStyle, padding: 10, borderColor: conversationId === chat.id ? "rgba(157,225,139,.65)" : "rgba(157,225,139,.12)" }}>
                <button onClick={() => openConversation(chat.id)} style={{ display: "block", width: "100%", textAlign: "left", color: "#e8f3e9", background: "transparent", border: 0, cursor: "pointer", padding: 0 }}>
                  <strong style={{ display: "block", fontSize: 13 }}>{chat.crop} · {chat.disease}</strong>
                  <span style={{ display: "block", color: "#9fb5a4", fontSize: 11, marginTop: 5 }}>{chat.language} · {chat.updated_at}</span>
                </button>
                <button onClick={() => deleteConversation(chat.id)} aria-label="Delete conversation" style={{ ...buttonStyle, padding: "4px 8px", marginTop: 8, fontSize: 11 }}>Delete</button>
              </div>
            ))}
          </div>
        </aside>

        <div className="glass-card" style={{ padding: 18, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 590 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", paddingBottom: 14, borderBottom: "1px solid rgba(170,210,175,.15)" }}>
            <div>
              <h3 style={{ margin: 0, color: "#edf7ed" }}>Plant Health Chat</h3>
              <p style={{ margin: "5px 0 0", color: "#9fb5a4", fontSize: 12 }}>
                {conversationId ? `Conversation #${conversationId}` : "Start a conversation to begin"}
              </p>
            </div>
            <select value={language} onChange={(e) => changeLanguage(e.target.value)} style={{ padding: "9px 10px", borderRadius: 9, border: "1px solid rgba(170,210,175,.22)", background: "#183b28", color: "#eaf5eb" }}>
              {languages.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <div style={{ flex: 1, minHeight: 300, maxHeight: 520, overflowY: "auto", padding: "18px 2px", display: "flex", flexDirection: "column", gap: 13 }}>
            {pageLoading ? <p style={{ color: "#b0c3b5", textAlign: "center" }}>Loading assistant...</p> : null}
            {!conversationId && !pageLoading && (
              <div style={{ margin: "auto", textAlign: "center", maxWidth: 440 }}>
                <div className="leaf-placeholder" style={{ margin: "0 auto 14px" }}><Bot size={34} /></div>
                <h3 style={{ color: "#e8f3e9" }}>How can I help your plants?</h3>
                <p style={{ color: "#b0c3b5", fontSize: 13, lineHeight: 1.6 }}>Start a chat. If you have already analysed a leaf, its latest crop, disease and confidence will be included as context.</p>
                <button onClick={startConversation} disabled={loading} style={{ ...buttonStyle, background: "#9de18b", color: "#10251a", fontWeight: 700, padding: "11px 18px" }}>{loading ? "Starting..." : "Start AI conversation"}</button>
              </div>
            )}
            {messages.filter((m) => m.role !== "system").map((message, index) => (
              <div key={`${index}-${message.timestamp || ""}`} style={{ alignSelf: message.role === "user" ? "flex-end" : "flex-start", maxWidth: "min(85%, 680px)", padding: "12px 15px", borderRadius: 13, background: message.role === "user" ? "rgba(113,170,94,.24)" : "rgba(255,255,255,.07)", border: "1px solid rgba(157,225,139,.13)", color: "#e8f3e9", whiteSpace: "pre-wrap", lineHeight: 1.65, overflowWrap: "anywhere" }}>
                <div style={{ color: "#9de18b", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>{message.role === "user" ? "YOU" : "PLANTAI"}</div>
                {message.message}
              </div>
            ))}
            {loading && conversationId && <div style={{ color: "#b0c3b5", fontSize: 13 }}>PlantAI is thinking...</div>}
            <div ref={messagesEndRef} />
          </div>

          {error && <div role="alert" style={{ color: "#ffaaa0", background: "rgba(150,45,35,.16)", borderRadius: 9, padding: 10, marginBottom: 10, fontSize: 13 }}>{error}</div>}

          {conversationId ? (
            <form onSubmit={sendMessage} style={{ display: "flex", gap: 9, borderTop: "1px solid rgba(170,210,175,.15)", paddingTop: 14 }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={4000} placeholder="Ask about symptoms, treatment or prevention..." disabled={loading} style={{ flex: 1, minWidth: 0, padding: "13px 14px", borderRadius: 10, border: "1px solid rgba(170,210,175,.2)", outline: 0, color: "#edf7ed", background: "rgba(5,25,15,.45)" }} />
              <button type="submit" disabled={!input.trim() || loading} style={{ ...buttonStyle, background: !input.trim() || loading ? "#536b58" : "#9de18b", color: "#10251a", fontWeight: 700 }}>Send</button>
            </form>
          ) : (
            <div style={{ color: "#8fa997", fontSize: 12, textAlign: "center", paddingTop: 12 }}>Start a conversation to send messages.</div>
          )}
          <p style={{ color: "#829b89", fontSize: 11, margin: "10px 0 0" }}>AI guidance is informational. Confirm diagnosis and treatment decisions with local agricultural experts and product labels.</p>
        </div>
      </div>
    </section>
  );
}



// ======================================================
// DISEASE LIBRARY
// ======================================================

const diseaseLibraryItems = [
  ["Apple", "Apple scab"], ["Apple", "Black rot"], ["Apple", "Cedar apple rust"], ["Apple", "Healthy"],
  ["Blueberry", "Healthy"],
  ["Cherry", "Powdery mildew"], ["Cherry", "Healthy"],
  ["Corn", "Cercospora leaf spot / Gray leaf spot"], ["Corn", "Common rust"], ["Corn", "Northern Leaf Blight"], ["Corn", "Healthy"],
  ["Grape", "Black rot"], ["Grape", "Esca (Black Measles)"], ["Grape", "Leaf blight (Isariopsis Leaf Spot)"], ["Grape", "Healthy"],
  ["Orange", "Haunglongbing (Citrus greening)"],
  ["Peach", "Bacterial spot"], ["Peach", "Healthy"],
  ["Bell Pepper", "Bacterial spot"], ["Bell Pepper", "Healthy"],
  ["Potato", "Early blight"], ["Potato", "Late blight"], ["Potato", "Healthy"],
  ["Raspberry", "Healthy"],
  ["Soybean", "Healthy"],
  ["Squash", "Powdery mildew"],
  ["Strawberry", "Leaf scorch"], ["Strawberry", "Healthy"],
  ["Tomato", "Bacterial spot"], ["Tomato", "Early blight"], ["Tomato", "Late blight"], ["Tomato", "Leaf Mold"],
  ["Tomato", "Septoria leaf spot"], ["Tomato", "Spider mites / Two-spotted spider mite"],
  ["Tomato", "Target Spot"], ["Tomato", "Tomato Yellow Leaf Curl Virus"], ["Tomato", "Tomato mosaic virus"], ["Tomato", "Healthy"],
].map(([crop, disease], index) => ({
  id: index + 1,
  crop,
  disease,
  healthy: disease === "Healthy",
}));

function DiseaseLibraryPage() {
  const [query, setQuery] = useState("");
  const [cropFilter, setCropFilter] = useState("All");
  const [showHealthy, setShowHealthy] = useState(true);
  const crops = [...new Set(diseaseLibraryItems.map(item => item.crop))].sort();
  const filtered = diseaseLibraryItems.filter(item => {
    const matchesQuery = `${item.crop} ${item.disease}`.toLowerCase().includes(query.toLowerCase());
    const matchesCrop = cropFilter === "All" || item.crop === cropFilter;
    const matchesHealthy = showHealthy || !item.healthy;
    return matchesQuery && matchesCrop && matchesHealthy;
  });

  return (
    <section style={{ paddingTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <div className="date-badge"><Sprout size={16} /> Plant knowledge base</div>
          <h1 style={{ margin: "14px 0 6px" }}>Disease Library</h1>
          <p style={{ color: "#a9bbae", margin: 0 }}>Browse the 38 plant-health categories supported by the current classifier.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="glass-card" style={{ padding: "12px 16px" }}><strong style={{ fontSize: 22 }}>{diseaseLibraryItems.length}</strong><div style={{ color: "#a9bbae", fontSize: 12 }}>Categories</div></div>
          <div className="glass-card" style={{ padding: "12px 16px" }}><strong style={{ fontSize: 22 }}>{crops.length}</strong><div style={{ color: "#a9bbae", fontSize: 12 }}>Crops</div></div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <Search size={17} style={{ position: "absolute", left: 13, top: 13, color: "#8ca494" }} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search crop or disease..." style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px 12px 40px", borderRadius: 12, border: "1px solid #345343", background: "#10251b", color: "#e7f1e9", outline: "none" }} />
          </div>
          <select value={cropFilter} onChange={e => setCropFilter(e.target.value)} style={{ padding: 12, borderRadius: 12, border: "1px solid #345343", background: "#10251b", color: "#e7f1e9" }}>
            <option value="All">All crops</option>
            {crops.map(crop => <option key={crop} value={crop}>{crop}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#b9cbbd", fontSize: 13 }}>
            <input type="checkbox" checked={showHealthy} onChange={e => setShowHealthy(e.target.checked)} /> Include healthy classes
          </label>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(245px, 1fr))", gap: 15 }}>
        {filtered.map(item => (
          <article key={item.id} className="glass-card" style={{ padding: 18, border: item.healthy ? "1px solid #477b54" : "1px solid rgba(130,170,140,.16)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ color: "#9bb9a2", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>{item.crop}</span>
              <span style={{ fontSize: 11, borderRadius: 20, padding: "5px 9px", color: item.healthy ? "#a7e5a7" : "#e7c98c", background: item.healthy ? "rgba(91,170,92,.14)" : "rgba(198,155,73,.12)" }}>{item.healthy ? "Healthy" : "Disease class"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, display: "grid", placeItems: "center", background: "rgba(112,177,117,.13)", color: "#9bd18e" }}><Leaf size={22} /></div>
              <div style={{ color: "#edf5ee", fontWeight: 650, lineHeight: 1.4 }}>{item.disease}</div>
            </div>
            <p style={{ color: "#9fb2a4", fontSize: 12, lineHeight: 1.6, margin: "14px 0 0" }}>
              {item.healthy ? "Healthy leaf category included in the model's classification labels." : "Recognized disease category. Confirm symptoms in the field before choosing a treatment."}
            </p>
          </article>
        ))}
      </div>
      {filtered.length === 0 && <div className="glass-card" style={{ padding: 30, textAlign: "center", color: "#a9bbae" }}>No matching categories. Try another search or crop.</div>}
      <p style={{ color: "#849b8a", fontSize: 12, lineHeight: 1.6, marginTop: 20 }}>Note: This library lists the classifier's supported labels. It is an educational reference, not a definitive field diagnosis or pesticide prescription. Diagnosis can be affected by image quality, lighting, and symptoms that resemble one another.</p>
    </section>
  );
}


// ======================================================
// MODEL INFORMATION
// ======================================================

function ModelInformationPage() {
  const specifications = [
    ["Architecture", "ResNet18 convolutional neural network"],
    ["Classification labels", "38 plant-health categories"],
    ["Crop coverage", "14 crop types"],
    ["Validation accuracy", "98.99% (reported validation result)"],
    ["Input preprocessing", "Resize / configured image transform and ImageNet normalization"],
    ["Inference", "PyTorch model loaded from best_model.pth"],
    ["Explainability", "Grad-CAM heatmap for visual attention"],
    ["Backend", "FastAPI + PyTorch"],
  ];

  const stages = [
    ["01", "Image upload", "A leaf image is sent to the FastAPI detection endpoint."],
    ["02", "Preprocessing", "The image is transformed into the tensor format expected by the trained model."],
    ["03", "Classification", "ResNet18 produces scores for the 38 supported categories."],
    ["04", "Explanation", "Grad-CAM generates a heatmap to help visualize influential image regions."],
    ["05", "Guidance", "The application returns recommendations and can pass the result context to the AI assistant."],
  ];

  return (
    <section style={{ paddingTop: 24 }}>
      <div style={{ marginBottom: 22 }}>
        <div className="date-badge"><BrainCircuit size={16} /> Under the hood</div>
        <h1 style={{ margin: "14px 0 6px" }}>Model Information</h1>
        <p style={{ color: "#a9bbae", margin: 0 }}>Technical overview of the plant disease classification pipeline.</p>
      </div>

      <div className="glass-card" style={{ padding: 24, marginBottom: 18, background: "linear-gradient(120deg, rgba(45,104,64,.30), rgba(17,43,30,.72))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <span style={{ color: "#9ed39b", fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase" }}>Active model</span>
            <h2 style={{ margin: "8px 0", fontSize: 28 }}>ResNet18</h2>
            <p style={{ color: "#b4c7b8", margin: 0, maxWidth: 600, lineHeight: 1.7 }}>A convolutional neural network used to classify leaf images into the supported crop and disease categories.</p>
          </div>
          <div style={{ minWidth: 130, textAlign: "center", padding: 20, borderRadius: 18, background: "rgba(129,190,124,.12)" }}>
            <div style={{ fontSize: 32, fontWeight: 750, color: "#a9e39b" }}>98.99%</div>
            <div style={{ color: "#a9bbae", fontSize: 12 }}>Validation accuracy</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 18 }}>
        {specifications.map(([label, value]) => (
          <div key={label} className="glass-card" style={{ padding: 18 }}>
            <div style={{ color: "#91aa98", fontSize: 12, marginBottom: 9 }}>{label}</div>
            <div style={{ color: "#e8f2e9", fontWeight: 600, lineHeight: 1.5 }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ padding: 22, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>How a prediction works</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
          {stages.map(([number, title, description]) => (
            <div key={number} style={{ padding: 15, borderRadius: 14, background: "rgba(112,160,120,.08)", border: "1px solid rgba(130,170,140,.12)" }}>
              <div style={{ color: "#91cf87", fontWeight: 750, fontSize: 13, marginBottom: 12 }}>{number}</div>
              <div style={{ fontWeight: 650, marginBottom: 7 }}>{title}</div>
              <p style={{ color: "#9fb2a4", fontSize: 12, lineHeight: 1.65, margin: 0 }}>{description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card" style={{ padding: 22 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}><ShieldCheck color="#9bd18e" /><h3 style={{ margin: 0 }}>Understanding the score</h3></div>
        <p style={{ color: "#a9bbae", lineHeight: 1.75, margin: 0 }}>The 98.99% figure is the model's reported validation accuracy, not a guarantee of the same performance on every farm, camera, lighting condition, or leaf variety. Treat each result as decision support and verify uncertain cases with an agricultural expert. Grad-CAM is an explanation aid; it does not independently prove that the highlighted region caused the prediction.</p>
      </div>
    </section>
  );
}



// ======================================================
// NOTIFICATIONS — DERIVED FROM REAL DETECTION HISTORY
// ======================================================

function NotificationsPage({ analyticsData, settings }) {
  const activity = analyticsData?.recent_activity || [];
  const notifications = activity
    .filter((item) => settings?.diseaseAlerts !== false && !item.healthy)
    .filter(() => settings?.activityAlerts !== false)
    .map((item, index) => ({
      id: `${item.timestamp}-${index}`,
      title: "Disease detected",
      message: `${item.disease} was detected on ${item.crop}.`,
      timestamp: item.timestamp,
      confidence: item.confidence,
    }));

  return (
    <section style={{ padding: "26px 0" }}>
      <div style={{ marginBottom: 22 }}>
        <p className="eyebrow">PLANT HEALTH ALERTS</p>
        <h1 style={{ margin: "8px 0" }}>Notifications</h1>
        <p style={{ color: "#a9bbae" }}>
          Alerts generated from your latest saved detection records.
        </p>
      </div>

      <div className="glass-card" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <h3 style={{ margin: 0 }}>Recent disease alerts</h3>
          <span style={{ color: "#a9e99c", fontSize: 13 }}>
            {notifications.length} alert{notifications.length === 1 ? "" : "s"} in the selected analytics period
          </span>
        </div>

        {notifications.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", color: "#a9bbae" }}>
            <ShieldCheck size={34} style={{ marginBottom: 10, color: "#9bd18e" }} />
            <p style={{ margin: 0 }}>No disease alerts in the selected period.</p>
          </div>
        ) : notifications.map((item) => (
          <article key={item.id} style={{ display: "flex", gap: 14, padding: "16px 0", borderTop: "1px solid rgba(170,210,175,.12)" }}>
            <div style={{ width: 38, height: 38, flex: "0 0 38px", borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(215,139,75,.15)", color: "#ffc18e" }}>
              <Bell size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <strong>{item.title}</strong>
              <p style={{ margin: "5px 0", color: "#b0c3b5", lineHeight: 1.5 }}>{item.message}</p>
              <small style={{ color: "#829b89" }}>
                {new Date(item.timestamp).toLocaleString()} · Confidence {Number(item.confidence).toFixed(1)}%
              </small>
            </div>
          </article>
        ))}
        <p style={{ color: "#829b89", fontSize: 12, margin: "16px 0 0" }}>
          These are in-app alerts based on the latest 8 activity records returned by the analytics API. They are not push notifications.
        </p>
      </div>
    </section>
  );
}



// ======================================================
// SETTINGS — LOCAL DEVICE PREFERENCES
// ======================================================
const DEFAULT_PLANTAI_SETTINGS = {
  language: "English", temperatureUnit: "C", theme: "dark",
  compactMode: false, diseaseAlerts: true, activityAlerts: true,
};

function SettingsPage({ settings, onChange, onSave, onReset, saveMessage, onClearDetections, onClearConversations, user, onUserUpdated }) {
  const [profile, setProfile] = useState({ name: user?.name || "", village: user?.village || "", district: user?.district || "", state: user?.state || "" });
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    setProfile({ name: user?.name || "", village: user?.village || "", district: user?.district || "", state: user?.state || "" });
  }, [user?.id, user?.name, user?.village, user?.district, user?.state]);

  const saveProfile = async (event) => {
    event.preventDefault(); setProfileBusy(true); setProfileError(""); setProfileMessage("");
    try {
      const response = await apiFetch(`${API_URL}/api/auth/profile`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name.trim(), village: profile.village.trim() || null, district: profile.district.trim() || null, state: profile.state.trim() || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not update profile.");
      onUserUpdated?.(data.user); setProfileMessage("Profile updated successfully.");
    } catch (error) { setProfileError(error.message || "Unable to update profile."); }
    finally { setProfileBusy(false); }
  };

  const changePassword = async (event) => {
    event.preventDefault(); setPasswordError(""); setPasswordMessage("");
    if (passwordForm.new_password !== passwordForm.confirm_password) { setPasswordError("New passwords do not match."); return; }
    if (passwordForm.new_password.length < 8) { setPasswordError("New password must contain at least 8 characters."); return; }
    setPasswordBusy(true);
    try {
      const response = await apiFetch(`${API_URL}/api/auth/change-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: passwordForm.current_password, new_password: passwordForm.new_password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not change password.");
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setPasswordMessage("Password changed successfully.");
    } catch (error) { setPasswordError(error.message || "Unable to change password."); }
    finally { setPasswordBusy(false); }
  };
  const update = (key, value) => onChange((current) => ({ ...current, [key]: value }));
  const selectStyle = { minWidth: 170, padding: "10px 12px", borderRadius: 10, color: "#e4f0e6", background: "#173b29", border: "1px solid rgba(170,210,175,.25)" };
  const buttonStyle = { padding: "10px 15px", borderRadius: 10, cursor: "pointer", color: "#e4f0e6", background: "rgba(130,190,130,.12)", border: "1px solid rgba(160,210,160,.25)", fontWeight: 600 };
  const row = (title, description, control) => (
    <div key={title} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap", padding: "17px 0", borderBottom: "1px solid rgba(170,210,175,.12)" }}>
      <div style={{ flex: "1 1 230px" }}><div style={{ fontWeight: 650, color: "#e4f0e6" }}>{title}</div><div style={{ color: "#91aa98", fontSize: 12, marginTop: 5, lineHeight: 1.5 }}>{description}</div></div>
      {control}
    </div>
  );
  const toggle = (key) => <input type="checkbox" checked={Boolean(settings[key])} onChange={(e) => update(key, e.target.checked)} style={{ width: 19, height: 19, accentColor: "#8bd27c" }} />;
  const section = (title, children) => <div className="glass-card" style={{ padding: 22, marginBottom: 18 }}><h3 style={{ margin: "0 0 8px" }}>{title}</h3>{children}</div>;
  const clear = (label, action) => { if (window.confirm(`Are you sure you want to clear ${label}? This cannot be undone.`)) action(); };

  return <section style={{ padding: "26px 0" }}>
    <div style={{ marginBottom: 22 }}><p className="eyebrow">PERSONALIZE YOUR WORKSPACE</p><h1 style={{ margin: "8px 0" }}>Settings</h1><p style={{ color: "#a9bbae" }}>Manage your AI assistant, display, alerts and local data preferences.</p></div>
    {section("Farmer Account & Profile",
      <>
        <p style={{ color: "#91aa98", fontSize: 12, marginTop: 0 }}>Update the personal and farm-location details linked to your account.</p>
        <form onSubmit={saveProfile} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
          {[ ["name","Full name"], ["village","Village"], ["district","District"], ["state","State"] ].map(([key,label]) => <label key={key} style={{ display: "grid", gap: 6, color: "#c6d8c8", fontSize: 12 }}>{label}<input value={profile[key]} onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))} required={key === "name"} maxLength={100} style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 9, border: "1px solid rgba(170,210,175,.25)", background: "rgba(3,20,11,.48)", color: "#eff8ef" }} /></label>)}
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><button type="submit" disabled={profileBusy} style={buttonStyle}>{profileBusy ? "Saving…" : "Save profile"}</button>{profileMessage && <span role="status" style={{ color: "#a9e99c", fontSize: 12 }}>{profileMessage}</span>}{profileError && <span role="alert" style={{ color: "#ffb5a9", fontSize: 12 }}>{profileError}</span>}</div>
        </form>
        <div style={{ color: "#91aa98", fontSize: 12, marginTop: 12 }}>Email: {user?.email || "Not provided"} · Mobile: {user?.mobile || "Not provided"}</div>
      </>) }
    {section("Change Password",
      <form onSubmit={changePassword} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        {[ ["current_password","Current password"], ["new_password","New password"], ["confirm_password","Confirm new password"] ].map(([key,label]) => <label key={key} style={{ display: "grid", gap: 6, color: "#c6d8c8", fontSize: 12 }}>{label}<input type="password" autoComplete={key === "current_password" ? "current-password" : "new-password"} minLength={key === "current_password" ? 1 : 8} maxLength={128} required value={passwordForm[key]} onChange={(e) => setPasswordForm((p) => ({ ...p, [key]: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 9, border: "1px solid rgba(170,210,175,.25)", background: "rgba(3,20,11,.48)", color: "#eff8ef" }} /></label>)}
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><button type="submit" disabled={passwordBusy} style={buttonStyle}>{passwordBusy ? "Updating…" : "Change password"}</button>{passwordMessage && <span role="status" style={{ color: "#a9e99c", fontSize: 12 }}>{passwordMessage}</span>}{passwordError && <span role="alert" style={{ color: "#ffb5a9", fontSize: 12 }}>{passwordError}</span>}</div>
        <p style={{ gridColumn: "1 / -1", color: "#829b89", fontSize: 11, margin: 0 }}>Use at least 8 characters. Your current password is required to authorize this change.</p>
      </form>) }
    {section("General & AI Assistant", row("Default AI language", "Used when you start a new AI Assistant conversation. Existing conversations keep their saved language.", <select value={settings.language} onChange={(e) => update("language", e.target.value)} style={selectStyle}>{["English","Hindi","Hinglish","Bhojpuri","Bengali","Marathi","Punjabi","Tamil","Telugu"].map(x => <option key={x}>{x}</option>)}</select>))}
    {section("Display & Weather",
      <>
        {row("Appearance", "Choose the dashboard color appearance.", <select value={settings.theme} onChange={(e) => update("theme", e.target.value)} style={selectStyle}><option value="dark">Dark forest</option><option value="light">Light</option></select>)}
        {row("Temperature unit", "Choose how weather temperatures are displayed.", <select value={settings.temperatureUnit} onChange={(e) => update("temperatureUnit", e.target.value)} style={selectStyle}><option value="C">Celsius (°C)</option><option value="F">Fahrenheit (°F)</option></select>)}
        {row("Compact dashboard", "Reduce spacing in dashboard cards for a denser layout.", toggle("compactMode"))}
      </>)}
    {section("Notifications",
      <>
        {row("Disease detection alerts", "Show alerts when a saved detection identifies a disease.", toggle("diseaseAlerts"))}
        {row("Activity alerts", "Allow activity notices in the Notifications section.", toggle("activityAlerts"))}
        <p style={{ color: "#829b89", fontSize: 12, marginBottom: 0 }}>These are in-app preferences. Browser push notifications are not enabled.</p>
      </>)}
    {section("Privacy & Data",
      <>
        {row("Clear detection history", "Delete saved plant detection records from local SQLite.", <button style={buttonStyle} onClick={() => clear("all detection history", onClearDetections)}>Clear detections</button>)}
        {row("Clear AI conversations", "Delete saved AI chat conversations from the local database.", <button style={buttonStyle} onClick={() => clear("all AI conversations", onClearConversations)}>Clear conversations</button>)}
      </>)}
    {section("Save preferences",
      <>
        <p style={{ color: "#91aa98", fontSize: 12, lineHeight: 1.6 }}>Preferences are stored in this browser on this device. After authentication is added, they can be linked to your account and synced across devices.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button onClick={onSave} style={{ ...buttonStyle, background: "rgba(116,190,105,.22)" }}>Save settings</button>
          <button onClick={onReset} style={buttonStyle}>Restore defaults</button>
          {saveMessage && <span role="status" style={{ color: "#a9e99c", fontSize: 13 }}>{saveMessage}</span>}
        </div>
      </>)}
  </section>;
}

// ======================================================
// REPORTS & EXPORT
// ======================================================

function ReportsPage({ analyticsData, analyticsPeriod, setAnalyticsPeriod, analyticsLoading }) {
  const rows = analyticsData?.recent_activity || [];

  const exportCSV = async () => {
    try {
      const response = await apiFetch(`${API_URL}/api/dashboard/report?period=${analyticsPeriod}`);
      if (!response.ok) throw new Error("Unable to prepare report export");
      const report = await response.json();
      const exportRows = report.records || [];
      const columns = ["Timestamp", "Crop", "Disease", "Confidence (%)", "Status"];
      const values = exportRows.map((row) => [
        row.timestamp,
        row.crop,
        row.disease,
        Number(row.confidence).toFixed(2),
        row.healthy ? "Healthy" : "Disease",
      ]);
      const escapeCSV = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
      const csv = [columns, ...values].map((line) => line.map(escapeCSV).join(",")).join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `plantai-detections-${analyticsPeriod}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("CSV export error:", error);
      window.alert("Could not export the report. Please check that the backend is running.");
    }
  };

  const total = analyticsData?.total_detections ?? 0;
  const healthy = analyticsData?.healthy_plants ?? 0;
  const diseased = analyticsData?.diseased_plants ?? 0;

  return (
    <section style={{ padding: "26px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <p className="eyebrow">DATA & INSIGHTS</p>
          <h1 style={{ margin: "8px 0" }}>Reports & Export</h1>
          <p style={{ color: "#a9bbae" }}>Review detection summaries and export the records currently available in this report.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="icon-button" onClick={exportCSV} disabled={!rows.length} style={{ width: "auto", padding: "0 15px", opacity: rows.length ? 1 : .5 }}>
            <Activity size={16} /> Export CSV
          </button>
          <button className="icon-button" onClick={() => window.print()} style={{ width: "auto", padding: "0 15px" }}>
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 20, marginBottom: 18 }}>
        <label style={{ color: "#a9bbae", fontSize: 13, marginRight: 12 }}>Report period</label>
        <select value={analyticsPeriod} onChange={(event) => setAnalyticsPeriod(event.target.value)} style={{ background: "#173b2c", color: "#e9f2e9", border: "1px solid rgba(170,210,175,.25)", borderRadius: 9, padding: "10px 13px" }}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
        {analyticsLoading && <span style={{ color: "#91cf87", fontSize: 12, marginLeft: 12 }}>Refreshing report…</span>}
      </div>

      <div className="stats-grid">
        {[
          ["Total detections", total],
          ["Healthy plants", healthy],
          ["Diseased plants", diseased],
        ].map(([label, value]) => (
          <div className="glass-card stat-card" key={label}>
            <span className="stat-label">{label}</span>
            <h2>{value}</h2>
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ padding: 22, marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Detection records</h3>
        {rows.length === 0 ? (
          <p style={{ color: "#a9bbae" }}>No records are available for this report period.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead><tr style={{ textAlign: "left", color: "#a9c6ad", borderBottom: "1px solid rgba(170,210,175,.2)" }}>
                {["Date & time", "Crop", "Prediction", "Confidence", "Status"].map((heading) => <th key={heading} style={{ padding: 12, fontSize: 12 }}>{heading}</th>)}
              </tr></thead>
              <tbody>{rows.map((row, index) => (
                <tr key={`${row.timestamp}-${index}`} style={{ borderBottom: "1px solid rgba(170,210,175,.1)" }}>
                  <td style={{ padding: 12, color: "#b0c3b5", fontSize: 13 }}>{new Date(row.timestamp).toLocaleString()}</td>
                  <td style={{ padding: 12 }}>{row.crop}</td>
                  <td style={{ padding: 12 }}>{row.disease}</td>
                  <td style={{ padding: 12 }}>{Number(row.confidence).toFixed(1)}%</td>
                  <td style={{ padding: 12, color: row.healthy ? "#a9e99c" : "#ffc18e" }}>{row.healthy ? "Healthy" : "Disease"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p style={{ color: "#829b89", fontSize: 12, marginBottom: 0 }}>
          CSV export retrieves all saved detection records for the selected period.
        </p>
      </div>
    </section>
  );
}


// ======================================================
// MAIN APP
// ======================================================

function DashboardApp({ user, onLogout, onUserUpdated }) {

  const [activePage, setActivePage] = useState("Dashboard");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("plantai_settings") || "{}");
      return { ...DEFAULT_PLANTAI_SETTINGS, ...saved };
    } catch { return { ...DEFAULT_PLANTAI_SETTINGS }; }
  });
  const [settingsMessage, setSettingsMessage] = useState("");

  // Dashboard data
  const [statsData, setStatsData] = useState(null);

  const [statsLoading, setStatsLoading] = useState(true);

  // Real SQLite analytics
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsPeriod, setAnalyticsPeriod] = useState("7d");


  // Weather data
  const [weather, setWeather] = useState(null);

  const [weatherLoading, setWeatherLoading] = useState(true);

  const [weatherError, setWeatherError] = useState("");

  const [locationName, setLocationName] = useState("Your Location");

  useEffect(() => {
    document.body.classList.toggle("plantai-light-theme", settings.theme === "light");
    document.body.classList.toggle("plantai-compact-mode", Boolean(settings.compactMode));
    return () => document.body.classList.remove("plantai-light-theme", "plantai-compact-mode");
  }, [settings.theme, settings.compactMode]);

  const saveSettings = () => {
    localStorage.setItem("plantai_settings", JSON.stringify(settings));
    setSettingsMessage("Settings saved on this device.");
    window.setTimeout(() => setSettingsMessage(""), 3000);
  };
  const resetSettings = () => {
    setSettings({ ...DEFAULT_PLANTAI_SETTINGS });
    localStorage.setItem("plantai_settings", JSON.stringify(DEFAULT_PLANTAI_SETTINGS));
    setSettingsMessage("Default settings restored.");
    window.setTimeout(() => setSettingsMessage(""), 3000);
  };
  const clearDetectionHistory = async () => {
    try {
      const response = await apiFetch(`${API_URL}/api/history`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not clear detection history.");
      await fetchDashboardStats();
      await fetchDashboardAnalytics();
      window.alert("Detection history cleared.");
    } catch (error) { window.alert(error.message || "Unable to clear detection history."); }
  };
  const clearAIConversations = async () => {
    try {
      const response = await apiFetch(`${API_URL}/api/conversations`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not clear AI conversations.");
      window.alert("AI conversations cleared.");
    } catch (error) { window.alert(error.message || "Unable to clear AI conversations. Check backend support."); }
  };


  // ====================================================
  // FETCH DASHBOARD STATISTICS
  // ====================================================

  const fetchDashboardStats = useCallback(async () => {

    try {

      setStatsLoading(true);

      const response = await apiFetch(
        `${API_URL}/api/dashboard/stats`
      );

      if (!response.ok) {
        throw new Error("Unable to load dashboard statistics");
      }

      const data = await response.json();

      setStatsData(data);

    } catch (error) {

      console.error("Dashboard error:", error);

    } finally {

      setStatsLoading(false);

    }

  }, []);


  // ====================================================
  // FETCH REAL SQLITE ANALYTICS
  // ====================================================

  const fetchDashboardAnalytics = useCallback(async () => {
    try {
      setAnalyticsLoading(true);
      const response = await apiFetch(
        `${API_URL}/api/dashboard/analytics?period=${analyticsPeriod}`
      );
      if (!response.ok) {
        throw new Error("Unable to load dashboard analytics");
      }
      const data = await response.json();
      setAnalyticsData(data);
    } catch (error) {
      console.error("Dashboard analytics error:", error);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [analyticsPeriod]);


  // ====================================================
  // FETCH WEATHER
  // ====================================================

  const fetchWeather = useCallback(() => {

    if (!navigator.geolocation) {

      setWeatherError(
        "Geolocation is not supported by your browser."
      );

      setWeatherLoading(false);

      return;
    }

    setWeatherLoading(true);

    setWeatherError("");


    navigator.geolocation.getCurrentPosition(

      async (position) => {

        try {

          const latitude = position.coords.latitude;

          const longitude = position.coords.longitude;


          // Open-Meteo API
          const weatherURL =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${latitude}` +
            `&longitude=${longitude}` +
            `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
            `&daily=precipitation_probability_max` +
            `&timezone=auto`;


          const response = await apiFetch(weatherURL);

          if (!response.ok) {
            throw new Error("Weather service unavailable");
          }

          const data = await response.json();


          setWeather({

            temperature: data.current.temperature_2m,

            feelsLike: data.current.apparent_temperature,

            humidity: data.current.relative_humidity_2m,

            wind: data.current.wind_speed_10m,

            precipitation: data.daily.precipitation_probability_max?.[0] ?? 0,

            code: data.current.weather_code,

          });


          // Reverse geocoding for location name
          try {

            const locationResponse = await apiFetch(
              `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&count=1&language=en&format=json`
            );

            if (locationResponse.ok) {

              const locationData = await locationResponse.json();

              const place = locationData.results?.[0];

              if (place) {

                setLocationName(
                  [place.name, place.admin1]
                    .filter(Boolean)
                    .join(", ")
                );

              }

            }

          } catch (error) {

            console.log("Location name unavailable");

          }

        } catch (error) {

          setWeatherError(
            "Unable to fetch current weather."
          );

          console.error(error);

        } finally {

          setWeatherLoading(false);

        }

      },


      (error) => {

        let message = "Unable to access your location.";

        if (error.code === 1) {
          message = "Please allow location permission to see local weather.";
        }

        if (error.code === 2) {
          message = "Your current location is unavailable.";
        }

        if (error.code === 3) {
          message = "Location request timed out. Please retry.";
        }

        setWeatherError(message);

        setWeatherLoading(false);

      },


      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 600000,
      }

    );

  }, []);


  // ====================================================
  // INITIAL LOAD AND AUTOMATIC WEATHER REFRESH
  // ====================================================

  useEffect(() => {

    fetchDashboardStats();

    fetchWeather();

    const weatherInterval = setInterval(
      fetchWeather,
      15 * 60 * 1000
    );

    const statsInterval = setInterval(
      fetchDashboardStats,
      60 * 1000
    );

    return () => {
      clearInterval(weatherInterval);
      clearInterval(statsInterval);
    };

  }, [fetchDashboardStats, fetchWeather]);

  useEffect(() => {
    fetchDashboardAnalytics();

    const analyticsInterval = setInterval(
      fetchDashboardAnalytics,
      60 * 1000
    );

    return () => clearInterval(analyticsInterval);
  }, [fetchDashboardAnalytics]);


  // ====================================================
  // DASHBOARD STATISTICS
  // ====================================================

  const stats = [

    {
      title: "Total Detections",

      value: statsLoading
        ? "..."
        : statsData?.total_detections ?? 0,

      detail: "Total plant images analysed",

      icon: ScanSearch,

      color: "#9de18b",
    },

    {
      title: "Healthy Plants",

      value: statsLoading
        ? "..."
        : statsData?.healthy_plants ?? 0,

      detail: "Healthy detections",

      icon: Leaf,

      color: "#8bd6a0",
    },

    {
      title: "Disease Classes",

      value: statsData?.disease_classes ?? 38,

      detail: "Across 14 crops",

      icon: Sprout,

      color: "#e3cb78",
    },

    {
      title: "Model Accuracy",

      value: `${statsData?.model_accuracy ?? 98.99}%`,

      detail: "Validation accuracy",

      icon: ShieldCheck,

      color: "#91c8ee",
    },

  ];


  // ====================================================
  // RENDER
  // ====================================================

  return (

    <div className="dashboard">
      <style>{`
        body.plantai-light-theme { background: #eaf2e9 !important; color: #173b29 !important; }
        body.plantai-light-theme .dashboard { background: #eaf2e9 !important; color: #173b29 !important; }
        body.plantai-light-theme .main-content { color: #173b29 !important; }
        body.plantai-light-theme .glass-card { background: rgba(255,255,255,.90) !important; border-color: rgba(40,90,50,.16) !important; box-shadow: 0 10px 30px rgba(20,60,30,.08) !important; }
        body.plantai-light-theme .glass-card h1, body.plantai-light-theme .glass-card h2, body.plantai-light-theme .glass-card h3,
        body.plantai-light-theme .main-content h1, body.plantai-light-theme .main-content h2, body.plantai-light-theme .main-content h3 { color: #173b29 !important; }
        body.plantai-light-theme .glass-card p, body.plantai-light-theme .main-content p { color: #526b58; }
        body.plantai-compact-mode .glass-card { padding: 15px !important; }
        body.plantai-compact-mode .main-content section { margin-bottom: 12px !important; }
      `}</style>
      <div className="background-overlay" />


      {/* SIDEBAR */}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>

        <div className="brand">

          <div className="brand-icon">
            <Sprout size={28} />
          </div>

          <div>
            <h2>Plant<span>AI</span></h2>
            <p>Smart Agriculture</p>
          </div>

        </div>


        <div className="nav-heading">
          MAIN MENU
        </div>


        <nav>

          {sidebarItems.map((item) => {

            const Icon = item.icon;

            return (

              <button
                key={item.name}
                onClick={() => {

                  setActivePage(item.name);

                  setSidebarOpen(false);

                }}
                className={`nav-item ${
                  activePage === item.name ? "active" : ""
                }`}
              >

                <Icon size={19} />

                <span>{item.name}</span>

                {item.name === "AI Assistant" && (
                  <span className="new-badge">AI</span>
                )}

              </button>

            );

          })}

        </nav>


        <div className="sidebar-bottom">

          <div className="assistant-card">

            <div className="assistant-icon">
              <Bot size={23} />
            </div>

            <h3>AI Plant Assistant</h3>

            <p>
              Your intelligent plant health assistant.
              Ask questions about diseases and treatments.
            </p>

            <button
              onClick={() => setActivePage("AI Assistant")}
            >
              Ask AI Assistant <ArrowUpRight size={16} />
            </button>

          </div>


          <div className="profile">

            <div className="profile-avatar">
              P
            </div>

            <div>
              <h4>PlantAI User</h4>
              <p>Farm Manager</p>
            </div>

            <ChevronDown size={16} />

          </div>

        </div>

      </aside>


      {/* MAIN CONTENT */}

      <main className="main-content">
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ color: "#b0c3b5", fontSize: 13 }}>Signed in as <strong style={{ color: "#e8f3e9" }}>{user?.name || "Farmer"}</strong></span>
          <button type="button" onClick={onLogout} style={{ border: "1px solid rgba(170,210,175,.25)", borderRadius: 9, padding: "8px 12px", background: "rgba(255,255,255,.05)", color: "#e8f3e9", cursor: "pointer" }}>Log out</button>
        </div>


        {/* TOPBAR */}

        <header className="topbar">

          <button
            className="mobile-menu"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu />
          </button>


          <div className="search-box">

            <Search size={19} />

            <input
              placeholder="Search diseases, crops, reports..."
            />

          </div>


          <div className="top-actions">

            <button className="icon-button" onClick={() => setActivePage("Notifications")} aria-label="Open notifications">
              <Bell size={19} />
              <span className="notification-dot" />
            </button>

            <button className="icon-button">
              <Plus size={20} />
            </button>


            <div className="top-profile">

              <div className="profile-avatar">
                P
              </div>

              <div>
                <h4>PlantAI User</h4>
                <p>Administrator</p>
              </div>

              <ChevronDown size={15} />

            </div>

          </div>

        </header>


        {activePage === "Dashboard" ? (
        <>
      {/* WELCOME */}

        <section className="welcome-section">

          <div>

            <p className="eyebrow">
              YOUR AGRICULTURE INTELLIGENCE PLATFORM
            </p>

            <h1>
              Welcome back, Farmer <span>👋</span>
            </h1>

            <p className="welcome-subtitle">
              Here's an overview of your plant health analytics.
            </p>

          </div>


          <div className="date-badge">

            <Activity size={16} />

            Plant Health Dashboard

          </div>

        </section>


        {/* STATISTICS */}

        <section className="stats-grid">

          {stats.map((stat) => {

            const Icon = stat.icon;

            return (

              <div
                className="glass-card stat-card"
                key={stat.title}
              >

                <div className="stat-top">

                  <div
                    className="stat-icon"
                    style={{ color: stat.color }}
                  >
                    <Icon size={21} />
                  </div>

                  <span className="stat-label">
                    {stat.title}
                  </span>

                </div>


                <h2>{stat.value}</h2>


                <p className="stat-detail">

                  <TrendingUp size={14} />

                  {stat.detail}

                </p>

              </div>

            );

          })}

        </section>


        {/* DASHBOARD GRID */}

        <section className="dashboard-grid">


          {/* PLANT HEALTH OVERVIEW */}

          <div className="glass-card health-card">

            <div className="card-heading">

              <div>
                <h3>Plant Health Overview</h3>
                <p>Plant detection analytics</p>
              </div>

              <ShieldCheck size={20} />

            </div>


            <div className="health-content">

              <div className="health-circle">

                <div>
                  <strong>86</strong>
                  <span>Health Score</span>
                </div>

              </div>


              <div className="health-legend">

                <div>
                  <span className="legend-dot green" />
                  Healthy
                  <strong>65%</strong>
                </div>

                <div>
                  <span className="legend-dot yellow" />
                  Moderate
                  <strong>20%</strong>
                </div>

                <div>
                  <span className="legend-dot red" />
                  Affected
                  <strong>15%</strong>
                </div>

              </div>

            </div>


            <div className="improvement">

              <TrendingUp size={15} />

              Monitor plant health regularly

            </div>

          </div>


          {/* RECENT DETECTION */}

          <div className="glass-card recent-card">

            <div className="card-heading">

              <div>
                <h3>Recent Detection</h3>
                <p>Latest plant disease analysis</p>
              </div>

              <ScanSearch size={20} />

            </div>


            <div className="recent-placeholder">

              <div className="leaf-placeholder">
                <Leaf size={37} />
              </div>

              <h3>Plant Disease Detection</h3>

              <p>
                Upload a leaf image to identify
                plant diseases using AI.
              </p>

              <button
                onClick={() => setActivePage("Disease Detection")}
              >
                <Upload size={16} />
                Detect Plant Disease
              </button>

            </div>

          </div>


          {/* LIVE WEATHER CARD */}

          <div className="glass-card weather-card">

            <div className="card-heading">

              <div>
                <h3>Weather Today</h3>

                <p>📍 {locationName}</p>
              </div>

              <CloudSun size={22} />

            </div>


            {weatherLoading ? (

              <div className="weather-message">
                Getting your local weather...
              </div>

            ) : weatherError ? (

              <div className="weather-message">

                <p>{weatherError}</p>

                <button onClick={fetchWeather}>
                  Allow Location / Retry
                </button>

              </div>

            ) : weather ? (

              <>

                <div className="weather-main">

                  <div>

                    <h2>
                      {Math.round(settings.temperatureUnit === "F" ? (weather.temperature * 9 / 5 + 32) : weather.temperature)}°{settings.temperatureUnit}
                    </h2>

                    <p>
                      {getWeatherCondition(weather.code).label}
                    </p>

                    <span>
                      Feels like {Math.round(weather.feelsLike)}°C
                    </span>

                  </div>


                  <div className="weather-emoji">
                    {getWeatherCondition(weather.code).icon}
                  </div>

                </div>


                <div className="weather-details">

                  <div>
                    <Droplets size={17} />
                    <span>Humidity</span>
                    <strong>{weather.humidity}%</strong>
                  </div>

                  <div>
                    <Wind size={17} />
                    <span>Wind</span>
                    <strong>{weather.wind} km/h</strong>
                  </div>

                  <div>
                    <CloudSun size={17} />
                    <span>Rain chance</span>
                    <strong>{weather.precipitation}%</strong>
                  </div>

                </div>


                <button
                  className="weather-refresh"
                  onClick={fetchWeather}
                >
                  ↻ Refresh Weather
                </button>

              </>

            ) : null}

          </div>


          {/* DETECTION ACTIVITY */}

          <div className="glass-card trend-card">

            <div className="card-heading">

              <div>
                <h3>Detection Activity</h3>
                <p>Detection records saved in SQLite</p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <select
                  value={analyticsPeriod}
                  onChange={(event) => setAnalyticsPeriod(event.target.value)}
                  aria-label="Analytics date range"
                  style={{
                    background: "#153a28",
                    color: "#dcefe0",
                    border: "1px solid rgba(170,210,175,.25)",
                    borderRadius: 9,
                    padding: "8px 10px",
                    fontSize: 12,
                  }}
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="all">All time</option>
                </select>
                <TrendingUp size={20} />
              </div>

            </div>


            <div className="chart-container">

              <ResponsiveContainer width="100%" height="100%">

                <AreaChart data={analyticsData?.trend || []}>

                  <defs>

                    <linearGradient
                      id="chartGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >

                      <stop
                        offset="0%"
                        stopColor="#9ce88b"
                        stopOpacity={0.35}
                      />

                      <stop
                        offset="95%"
                        stopColor="#9ce88b"
                        stopOpacity={0}
                      />

                    </linearGradient>

                  </defs>


                  <XAxis
                    dataKey="label"
                    stroke="#b0c3b5"
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <YAxis
                    stroke="#b0c3b5"
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip
                    contentStyle={{
                      background: "#102e20",
                      border: "1px solid #41694e",
                      borderRadius: "10px",
                      color: "#fff",
                    }}
                  />


                  <Area
                    type="monotone"
                    dataKey="detections"
                    stroke="#9ce88b"
                    strokeWidth={3}
                    fill="url(#chartGradient)"
                  />

                </AreaChart>

              </ResponsiveContainer>

            </div>
            {analyticsLoading && (
              <p style={{ color: "#a9c6ad", fontSize: 12 }}>Updating analytics…</p>
            )}

          </div>


          {/* DISEASE DISTRIBUTION */}

          <div className="glass-card distribution-card">

            <div className="card-heading">

              <div>
                <h3>Disease Distribution</h3>
                <p>Distribution from saved predictions</p>
              </div>

              <Activity size={20} />

            </div>


            <div className="distribution-content">

              <div className="pie-wrapper">

                <ResponsiveContainer width="100%" height="100%">

                  <PieChart>

                    <Pie
                      data={analyticsData?.disease_distribution || []}
                      dataKey="value"
                      innerRadius={52}
                      outerRadius={76}
                      paddingAngle={4}
                    >

                      {(analyticsData?.disease_distribution || []).map((entry, index) => (

                        <Cell
                          key={entry.name}
                          fill={COLORS[index]}
                        />

                      ))}

                    </Pie>

                  </PieChart>

                </ResponsiveContainer>

              </div>


              <div className="distribution-legend">

                {(analyticsData?.disease_distribution || []).length === 0 ? (
                  <p style={{ color: "#a9c6ad", fontSize: 13 }}>
                    No saved detections for this period yet.
                  </p>
                ) : (analyticsData?.disease_distribution || []).map((item, index) => (

                  <div key={item.name}>

                    <span>
                      <i style={{ background: COLORS[index] }} />
                      {item.name}
                    </span>

                    <strong>{item.value}</strong>

                  </div>

                ))}

              </div>

            </div>
            <p style={{ color: "#8fa997", fontSize: 11, marginTop: 12 }}>
              {analyticsLoading ? "Refreshing…" : `${analyticsData?.total_detections ?? 0} detections in selected period`}
            </p>

          </div>

        </section>

        {/* RECENT DATABASE ACTIVITY */}
        <section className="glass-card" style={{ padding: 22, marginTop: 22 }}>
          <div className="card-heading">
            <div>
              <h3>Recent Detection Activity</h3>
              <p>Latest results saved in your local SQLite database</p>
            </div>
            <Activity size={20} />
          </div>
          {(analyticsData?.recent_activity || []).length === 0 ? (
            <p style={{ color: "#a9c6ad", padding: "18px 0" }}>
              No detections have been saved for the selected period.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", color: "#dcefe0", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "#9eb7a4", textAlign: "left", borderBottom: "1px solid rgba(170,210,175,.18)" }}>
                    {["Crop", "Prediction", "Confidence", "Date & time", "Status"].map((label) => (
                      <th key={label} style={{ padding: "11px 10px" }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(analyticsData?.recent_activity || []).map((item, index) => (
                    <tr key={`${item.timestamp}-${index}`} style={{ borderBottom: "1px solid rgba(170,210,175,.10)" }}>
                      <td style={{ padding: "12px 10px" }}>{item.crop}</td>
                      <td style={{ padding: "12px 10px" }}>{String(item.disease).replaceAll("___", " — ").replaceAll("_", " ")}</td>
                      <td style={{ padding: "12px 10px" }}>{Number(item.confidence).toFixed(1)}%</td>
                      <td style={{ padding: "12px 10px", color: "#a9c6ad" }}>{new Date(item.timestamp).toLocaleString()}</td>
                      <td style={{ padding: "12px 10px" }}>
                        <span style={{ color: item.healthy ? "#a9e99c" : "#ffd0a6" }}>
                          {item.healthy ? "Healthy" : "Disease"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>


        {/* AI ASSISTANT BANNER */}

        <section className="bottom-banner">

          <div className="banner-icon">
            <Bot size={27} />
          </div>

          <div>

            <h3>Need help with plant diseases?</h3>

            <p>
              Ask your AI assistant for disease explanations,
              prevention and plant care guidance.
            </p>

          </div>


          <button
            onClick={() => setActivePage("AI Assistant")}
          >
            Open AI Assistant <ArrowUpRight size={17} />
          </button>

        </section>


        <footer>
          PlantAI © 2026 · Intelligent Plant Disease Detection
        </footer>
        </>
      ) : activePage === "Disease Detection" ? (
        <DiseaseDetectionPage />
      ) : activePage === "Detection History" ? (
        <DetectionHistoryPage />
      ) : activePage === "Notifications" ? (
        <NotificationsPage analyticsData={analyticsData} settings={settings} />
      ) : activePage === "Reports & Export" ? (
        <ReportsPage analyticsData={analyticsData} analyticsPeriod={analyticsPeriod} setAnalyticsPeriod={setAnalyticsPeriod} analyticsLoading={analyticsLoading} />
      ) : activePage === "AI Assistant" ? (
        <AIAssistantPage defaultLanguage={settings.language} />
      ) : activePage === "Disease Library" ? (
        <DiseaseLibraryPage />
      ) : activePage === "Model Information" ? (
        <ModelInformationPage />
      ) : activePage === "Settings" ? (
        <SettingsPage settings={settings} onChange={setSettings} onSave={saveSettings} onReset={resetSettings} saveMessage={settingsMessage} onClearDetections={clearDetectionHistory} onClearConversations={clearAIConversations} user={user} onUserUpdated={onUserUpdated} />
      ) : (
        <section className="glass-card" style={{ padding: 28, marginTop: 28 }}>
          <h2>{activePage}</h2>
          <p style={{ color: "#b0c3b5", marginTop: 10 }}>
            This section will be connected in a later development phase.
          </p>
        </section>
      )}

      </main>

    </div>

  );

}


function FarmerAuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", mobile: "", password: "", village: "", district: "", state: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (mode === "register" && !form.email.trim() && !form.mobile.trim()) {
      setError("Please provide an email address or mobile number.");
      return;
    }
    setBusy(true);
    try {
      const payload = mode === "register"
        ? { name: form.name.trim(), email: form.email.trim() || null, mobile: form.mobile.trim() || null, password: form.password, village: form.village.trim() || null, district: form.district.trim() || null, state: form.state.trim() || null }
        : { identifier: form.email.trim(), password: form.password };
      const response = await apiFetch(`${API_URL}/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const action = mode === "register" ? "Registration" : "Login";
        throw new Error(
          data.detail || `${action} failed (HTTP ${response.status}). The backend may be unavailable.`
        );
      }
      onAuthenticated(data.user);
    } catch (err) {
      setError(err.message || "Unable to connect to PlantAI. Check that the backend is running.");
    } finally {
      setBusy(false);
    }
  };

  const fieldStyle = { width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 10, border: "1px solid rgba(169,205,174,.25)", background: "rgba(3,20,11,.48)", color: "#eff8ef", outline: "none", fontSize: 14 };
  const labelStyle = { display: "grid", gap: 7, color: "#c6d8c8", fontSize: 13, fontWeight: 600 };
  const input = (key, label, placeholder, type = "text", required = false) => (
    <label style={labelStyle}>
      {label}
      <input style={fieldStyle} type={type} value={form[key]} placeholder={placeholder} required={required} onChange={(e) => update(key, e.target.value)} autoComplete={key === "password" ? (mode === "login" ? "current-password" : "new-password") : key} />
    </label>
  );

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(340px,.95fr)", background: "radial-gradient(circle at 15% 15%, #28543a 0, #102b1d 38%, #07170f 100%)", color: "#eff8ef", fontFamily: "Inter, system-ui, sans-serif" }}>
      <section style={{ padding: "clamp(30px,7vw,90px)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 55 }}>
          <div style={{ width: 48, height: 48, display: "grid", placeItems: "center", borderRadius: 15, background: "rgba(157,225,139,.14)", color: "#a9e99c" }}><Leaf size={28} /></div>
          <div><div style={{ fontSize: 23, fontWeight: 800, letterSpacing: ".3px" }}>PlantAI</div><div style={{ color: "#a9c6ad", fontSize: 12 }}>Intelligent Plant Disease Detection</div></div>
        </div>
        <p style={{ color: "#a9e99c", letterSpacing: 2, fontSize: 11, fontWeight: 800 }}>SMARTER FARMING STARTS HERE</p>
        <h1 style={{ fontSize: "clamp(36px,5vw,62px)", lineHeight: 1.08, margin: "12px 0 18px", maxWidth: 620 }}>Healthy crops.<br/><span style={{ color: "#a9e99c" }}>Confident farmers.</span></h1>
        <p style={{ maxWidth: 540, color: "#bfd1c2", lineHeight: 1.8, fontSize: 16 }}>Detect plant diseases from leaf images, understand model predictions, and explore practical crop-care guidance from one farmer-friendly workspace.</p>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 28, color: "#c9dfcc", fontSize: 13 }}><span>✓ 38 disease & healthy classes</span><span>✓ Visual Grad-CAM explanation</span><span>✓ AI crop assistant</span></div>
      </section>

      <section style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <form onSubmit={submit} style={{ width: "min(480px,100%)", boxSizing: "border-box", padding: "clamp(24px,4vw,38px)", borderRadius: 24, border: "1px solid rgba(185,220,190,.18)", background: "rgba(12,38,24,.82)", boxShadow: "0 25px 80px rgba(0,0,0,.3)", backdropFilter: "blur(18px)" }}>
          <div style={{ color: "#a9e99c", fontSize: 12, fontWeight: 800, letterSpacing: 1.5 }}>{mode === "login" ? "WELCOME BACK" : "JOIN PLANTAI"}</div>
          <h2 style={{ fontSize: 29, margin: "9px 0 8px" }}>{mode === "login" ? "Farmer sign in" : "Create your account"}</h2>
          <p style={{ color: "#a9c6ad", fontSize: 13, lineHeight: 1.6, margin: "0 0 24px" }}>{mode === "login" ? "Sign in to continue to your PlantAI dashboard." : "Set up your farmer profile to get started."}</p>

          <div style={{ display: "grid", gap: 14 }}>
            {mode === "register" && <>
              {input("name", "Full name", "Enter your name", "text", true)}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
                {input("email", "Email address", "name@example.com", "email")}
                {input("mobile", "Mobile number", "+91XXXXXXXXXX", "tel")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12 }}>
                {input("village", "Village (optional)", "Village")}
                {input("district", "District (optional)", "District")}
                {input("state", "State (optional)", "State")}
              </div>
            </>}
            {mode === "login" && input("email", "Email or mobile number", "Enter email or mobile", "text", true)}
            <label style={labelStyle}>Password
              <div style={{ position: "relative" }}>
                <input style={{ ...fieldStyle, paddingRight: 70 }} type={showPassword ? "text" : "password"} value={form.password} placeholder={mode === "register" ? "At least 8 characters" : "Enter your password"} minLength={mode === "register" ? 8 : undefined} required onChange={(e) => update("password", e.target.value)} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} style={{ position: "absolute", right: 10, top: 9, border: 0, background: "transparent", color: "#a9e99c", cursor: "pointer", fontSize: 12 }}>{showPassword ? "Hide" : "Show"}</button>
              </div>
            </label>
          </div>
          {error && <div role="alert" style={{ marginTop: 16, padding: 12, borderRadius: 10, color: "#ffb5a9", background: "rgba(150,45,35,.16)", border: "1px solid rgba(255,130,110,.28)", fontSize: 13 }}>{error}</div>}
          <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 22, padding: 14, border: 0, borderRadius: 11, background: busy ? "#66866a" : "#a9e99c", color: "#10251a", fontWeight: 800, cursor: busy ? "wait" : "pointer", fontSize: 14 }}>{busy ? "Please wait…" : mode === "login" ? "Sign in to PlantAI" : "Create farmer account"}</button>
          <p style={{ color: "#a9c6ad", textAlign: "center", fontSize: 13, margin: "20px 0 0" }}>{mode === "login" ? "New to PlantAI?" : "Already have an account?"}{" "}<button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} style={{ border: 0, background: "transparent", color: "#a9e99c", fontWeight: 800, cursor: "pointer" }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
          {mode === "login" && <p style={{ color: "#819b87", fontSize: 11, lineHeight: 1.5, textAlign: "center", margin: "16px 0 0" }}>Forgot password? Password recovery will be added after a verified email/SMS service is configured.</p>}
        </form>
      </section>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch(`${API_URL}/api/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => { if (active && data?.user) setUser(data.user); })
      .catch(() => {})
      .finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, []);

  const logout = async () => {
    try { await apiFetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" }); }
    catch (error) { console.warn("Logout request failed:", error); }
    setUser(null);
  };

  if (checkingSession) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#07170f", color: "#cfe5d1", fontFamily: "system-ui" }}>Checking your PlantAI session…</div>;
  }
  return user
    ? <DashboardApp user={user} onLogout={logout} onUserUpdated={setUser} />
    : <FarmerAuthScreen onAuthenticated={setUser} />;
}

export default App;