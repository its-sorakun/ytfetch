/*
Implementation details:
Client-side presentation logic managing dual-theme states, animated tab navigation,
dynamic click ripples, video file uploads with drag-and-drop, inline video playback previews,
timecode synchronization, Windows Explorer file revelation, sorting controls,
non-blocking Fluent toast notifications, compact preview states, and Server-Sent Events (SSE) telemetry listeners.
Integrates native Microsoft Fluent System Icons for authentic Windows 11 aesthetics.
*/

let cachedRecentFiles = [];
let currentQuality = "best";

document.addEventListener("DOMContentLoaded", () => {
  applyFluentIcons();
  initializeTheme();
  initializeTabs();
  initializeClickRipples();
  initializePasteButton();
  initializeQualitySelector();
  initializeFolderButtons();
  initializeModeSelector();
  initializeVideoUploader();
  initializeVideoPreviewPlayer();
  initializeDownloadHandler();
  initializeEnhanceHandler();
  initializeRecentSortHandler();
  loadRecentDownloads();
  loadSystemStatus();

  const refreshBtn = document.getElementById("refresh-recent-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadRecentDownloads);
  }
});

/* Helper to render Fluent icons across DOM */
function applyFluentIcons(root = document) {
  if (typeof window.renderFluentIcons === "function") {
    window.renderFluentIcons(root);
  }
}

/* Query hardware status to surface dedicated GPU encoder info in the UI */
async function loadSystemStatus() {
  const engineText = document.getElementById("engine-status-text");
  if (!engineText) return;
  try {
    const res = await fetch("/api/system-status");
    if (res.ok) {
      const data = await res.json();
      if (data.device) {
        engineText.innerHTML = `GPU: <code>${data.device}</code> (${data.encoder})`;
      }
    }
  } catch {}
}

/* Windows 11 Fluent Toast Notifications */
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `fluent-toast toast-${type}`;

  let iconName = "sparkle_20_regular";
  if (type === "success") iconName = "checkmark_20_regular";
  else if (type === "error") iconName = "folder_open_20_regular";

  toast.innerHTML = `
    <span class="fluent-toast-icon" data-fluent="${iconName}"></span>
    <span class="fluent-toast-content">${message}</span>
  `;

  container.appendChild(toast);
  applyFluentIcons(toast);

  setTimeout(() => {
    toast.classList.add("hiding");
    setTimeout(() => {
      toast.remove();
    }, 260);
  }, 3200);
}

/* Light and Dark Theme Controller */
function initializeTheme() {
  const themeToggleBtn = document.getElementById("theme-toggle");
  const storedTheme = localStorage.getItem("ytfetch-theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  const activeTheme = storedTheme || (systemPrefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", activeTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";

      document.documentElement.setAttribute("data-theme", nextTheme);
      localStorage.setItem("ytfetch-theme", nextTheme);
      applyFluentIcons();
    });
  }
}

/* Segmented Tab Navigation */
function initializeTabs() {
  const tabButtons = document.querySelectorAll(".win11-tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");
  const tabSlider = document.getElementById("tab-slider");

  function updateSliderPosition(activeButton) {
    if (!activeButton || !tabSlider) return;
    const offsetLeft = activeButton.offsetLeft;
    const clientWidth = activeButton.clientWidth;
    tabSlider.style.transform = `translateX(${offsetLeft - 3}px)`;
    tabSlider.style.width = `${clientWidth}px`;
  }

  const initialActive = document.querySelector(".win11-tab-btn.active");
  if (initialActive) {
    updateSliderPosition(initialActive);
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-target");

      tabButtons.forEach((btn) => {
        btn.classList.remove("active");
        btn.setAttribute("aria-selected", "false");
      });

      tabPanels.forEach((panel) => {
        panel.classList.remove("active");
      });

      button.classList.add("active");
      button.setAttribute("aria-selected", "true");

      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add("active");
      }

      updateSliderPosition(button);
      applyFluentIcons();
    });
  });

  window.addEventListener("resize", () => {
    const currentActive = document.querySelector(".win11-tab-btn.active");
    if (currentActive) {
      updateSliderPosition(currentActive);
    }
  });
}

/* Fluid Organic Click Ripples */
function initializeClickRipples() {
  const wrappers = document.querySelectorAll(".acrylic-input-wrapper");

  wrappers.forEach((wrapper) => {
    wrapper.addEventListener("click", (event) => {
      const rippleHost = wrapper.querySelector(".ripple-host");
      if (!rippleHost) return;

      const rect = wrapper.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      const rippleDiameter = Math.max(rect.width, rect.height) * 1.3;

      const rippleElement = document.createElement("span");
      rippleElement.classList.add("click-ripple");
      rippleElement.style.width = `${rippleDiameter}px`;
      rippleElement.style.height = `${rippleDiameter}px`;
      rippleElement.style.left = `${clickX - rippleDiameter / 2}px`;
      rippleElement.style.top = `${clickY - rippleDiameter / 2}px`;

      rippleHost.appendChild(rippleElement);

      setTimeout(() => {
        rippleElement.remove();
      }, 600);

      const innerInput = wrapper.querySelector(".acrylic-input-core");
      if (innerInput && event.target !== innerInput) {
        innerInput.focus();
      }
    });
  });
}

/* Clipboard Paste Button */
function initializePasteButton() {
  const pasteBtn = document.getElementById("paste-url-btn");
  const urlInput = document.getElementById("youtube-url-input");

  if (!pasteBtn || !urlInput) return;

  pasteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        urlInput.focus();
      }
    } catch {
      urlInput.focus();
    }
  });
}

/* Stream Quality Preset Tiles Controller */
function initializeQualitySelector() {
  const qualityTiles = document.querySelectorAll(".quality-tile");

  qualityTiles.forEach((tile) => {
    tile.addEventListener("click", () => {
      qualityTiles.forEach((t) => t.classList.remove("active"));
      tile.classList.add("active");
      currentQuality = tile.getAttribute("data-quality") || "best";
    });
  });
}

/* Direct Folder Navigation Triggers */
function initializeFolderButtons() {
  const openFolderBtn = document.getElementById("open-folder-btn");
  const stripOpenFolderBtn = document.getElementById("strip-open-folder-btn");

  async function triggerOpenFolder() {
    try {
      await fetch("/api/open-downloads-folder", { method: "POST" });
    } catch (err) {
      console.error("Failed to open downloads folder:", err);
    }
  }

  if (openFolderBtn) {
    openFolderBtn.addEventListener("click", triggerOpenFolder);
  }
  if (stripOpenFolderBtn) {
    stripOpenFolderBtn.addEventListener("click", triggerOpenFolder);
  }
}

/* Enhancer Mode Toggle (CRF vs Explicit Bitrate) */
function initializeModeSelector() {
  const modeRadios = document.querySelectorAll("input[name='enhance-mode']");
  const bitrateGroup = document.getElementById("bitrate-custom-group");

  modeRadios.forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (bitrateGroup) {
        bitrateGroup.style.display = e.target.value === "target_bitrate" ? "flex" : "none";
      }
    });
  });

  const accordionToggleBtn = document.getElementById("toggle-path-input-btn");
  const manualPathContainer = document.getElementById("manual-path-container");
  const accordionArrow = document.getElementById("accordion-arrow");

  if (accordionToggleBtn && manualPathContainer) {
    accordionToggleBtn.addEventListener("click", () => {
      const isHidden = manualPathContainer.style.display === "none";
      manualPathContainer.style.display = isHidden ? "block" : "none";
      if (accordionArrow) {
        accordionArrow.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
      }
    });
  }
}

/* Video Upload and Drag-and-Drop Handler */
function initializeVideoUploader() {
  const dropzone = document.getElementById("upload-dropzone");
  const fileInput = document.getElementById("video-file-input");
  const progressOverlay = document.getElementById("upload-progress-overlay");
  const progressText = document.getElementById("upload-progress-text");
  const sourceInput = document.getElementById("enhance-source-input");
  const changeSourceBtn = document.getElementById("change-source-file-btn");
  const sourcePickerContainer = document.getElementById("source-picker-container");
  const loadedSourceBar = document.getElementById("loaded-source-bar");

  if (changeSourceBtn && sourcePickerContainer && loadedSourceBar) {
    changeSourceBtn.addEventListener("click", () => {
      loadedSourceBar.style.display = "none";
      sourcePickerContainer.style.display = "block";
    });
  }

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-active");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("drag-active");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-active");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  });

  async function uploadFile(file) {
    if (!progressOverlay) return;

    progressOverlay.style.display = "flex";
    if (progressText) progressText.textContent = `Uploading ${file.name}...`;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "File upload failed.");
      }

      const result = await response.json();
      if (sourceInput) {
        sourceInput.value = result.path;
      }

      loadVideoPreview(result.path, result.filename);
      loadRecentDownloads();
      showToast(`Uploaded ${result.filename}`, "success");
    } catch (err) {
      showToast(`Upload error: ${err.message}`, "error");
    } finally {
      progressOverlay.style.display = "none";
      fileInput.value = "";
    }
  }
}

/* Video Preview Player Controller */
function initializeVideoPreviewPlayer() {
  const videoPlayer = document.getElementById("inline-video-player");
  const playheadDisplay = document.getElementById("current-playhead-time");
  const durationDisplay = document.getElementById("preview-duration-text");
  const setStartBtn = document.getElementById("set-start-ts-btn");
  const setEndBtn = document.getElementById("set-end-ts-btn");
  const startTimeInput = document.getElementById("enhance-start-time");
  const endTimeInput = document.getElementById("enhance-end-time");

  if (!videoPlayer) return;

  function formatTime(seconds) {
    const totalSec = Math.floor(seconds);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  const videoErrorFallback = document.getElementById("video-error-fallback");

  videoPlayer.addEventListener("error", () => {
    if (videoErrorFallback) {
      videoErrorFallback.style.display = "flex";
    }
    videoPlayer.style.display = "none";
  });

  videoPlayer.addEventListener("timeupdate", () => {
    if (playheadDisplay) {
      playheadDisplay.textContent = formatTime(videoPlayer.currentTime);
    }
  });

  videoPlayer.addEventListener("loadedmetadata", () => {
    if (durationDisplay) {
      durationDisplay.textContent = formatTime(videoPlayer.duration);
    }
  });

  if (setStartBtn && startTimeInput) {
    setStartBtn.addEventListener("click", () => {
      startTimeInput.value = formatTime(videoPlayer.currentTime);
      startTimeInput.focus();
    });
  }

  if (setEndBtn && endTimeInput) {
    setEndBtn.addEventListener("click", () => {
      endTimeInput.value = formatTime(videoPlayer.currentTime);
      endTimeInput.focus();
    });
  }
}

/* Video Preview Loader */
function loadVideoPreview(absolutePath, displayName) {
  const sourcePickerContainer = document.getElementById("source-picker-container");
  const previewCard = document.getElementById("video-preview-card");
  const filenameText = document.getElementById("preview-filename-text");
  const videoPlayer = document.getElementById("inline-video-player");
  const videoErrorFallback = document.getElementById("video-error-fallback");
  const changeSourceBtn = document.getElementById("change-source-file-btn");
  const sourceInput = document.getElementById("enhance-source-input");

  if (sourcePickerContainer) sourcePickerContainer.style.display = "none";
  if (sourceInput) sourceInput.value = absolutePath;

  if (previewCard) {
    previewCard.style.display = "flex";
  }

  if (filenameText) {
    filenameText.textContent = displayName || absolutePath.split(/[\\/]/).pop() || "Video Preview";
  }

  if (videoPlayer) {
    if (videoErrorFallback) videoErrorFallback.style.display = "none";
    videoPlayer.style.display = "block";
    const streamUrl = `/api/stream-video?path=${encodeURIComponent(absolutePath)}`;
    videoPlayer.src = streamUrl;
    videoPlayer.load();
  }

  if (changeSourceBtn && sourcePickerContainer && previewCard) {
    changeSourceBtn.onclick = () => {
      previewCard.style.display = "none";
      sourcePickerContainer.style.display = "block";
      if (videoPlayer) {
        videoPlayer.pause();
        videoPlayer.src = "";
      }
    };
  }

  applyFluentIcons(previewCard);
}

/* Download Submission and SSE Progress Listener */
function initializeDownloadHandler() {
  const downloadForm = document.getElementById("download-form");
  const urlInput = document.getElementById("youtube-url-input");
  const submitBtn = document.getElementById("start-download-btn");
  const submitBtnText = document.getElementById("download-btn-text");
  const spinner = document.getElementById("download-spinner");
  const btnIcon = document.getElementById("download-btn-icon");

  const statusCard = document.getElementById("download-status-card");
  const statusBadge = document.getElementById("download-status-badge");
  const statusBadgeIcon = document.getElementById("download-status-badge-icon");
  const statusBadgeText = document.getElementById("download-status-badge-text");
  const filenameDisplay = document.getElementById("download-filename-display");
  const progressBar = document.getElementById("download-progress-bar");
  const metricPercent = document.getElementById("metric-percent");
  const metricSpeed = document.getElementById("metric-speed");
  const metricEta = document.getElementById("metric-eta");
  const statusMsg = document.getElementById("download-status-msg");

  if (!downloadForm) return;

  function updateDownloadBadge(statusText, badgeClass = "status-badge", iconName = "arrow_download_20_regular") {
    if (statusBadge) statusBadge.className = badgeClass;
    if (statusBadgeText) statusBadgeText.textContent = statusText;
    if (statusBadgeIcon) {
      statusBadgeIcon.setAttribute("data-fluent", iconName);
      applyFluentIcons(statusBadge);
    }
  }

  downloadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    submitBtn.disabled = true;
    if (submitBtnText) submitBtnText.textContent = "Downloading...";
    spinner.classList.add("active");
    if (btnIcon) btnIcon.style.display = "none";
    statusCard.style.display = "flex";

    updateDownloadBadge("Connecting", "status-badge", "arrow_download_20_regular");
    filenameDisplay.textContent = "Resolving stream metadata...";
    progressBar.style.width = "0%";
    metricPercent.textContent = "0%";
    metricSpeed.textContent = "Connecting...";
    metricEta.textContent = "Estimating...";
    statusMsg.textContent = "Contacting YouTube servers...";

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, quality: currentQuality }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Server rejected download request.");
      }

      const { job_id } = await response.json();
      attachDownloadEventSource(job_id);
    } catch (err) {
      updateDownloadBadge("Error", "status-badge failed", "arrow_download_20_regular");
      statusMsg.textContent = err.message;
      submitBtn.disabled = false;
      if (submitBtnText) submitBtnText.textContent = "Start Download";
      spinner.classList.remove("active");
      if (btnIcon) btnIcon.style.display = "inline-flex";
      showToast(err.message, "error");
    }
  });

  function attachDownloadEventSource(jobId) {
    const eventSource = new EventSource(`/api/download/stream/${jobId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === "downloading" || data.status === "starting") {
          updateDownloadBadge("Downloading", "status-badge", "arrow_download_20_regular");

          if (data.filename) filenameDisplay.textContent = data.filename;
          if (data.percent) {
            metricPercent.textContent = data.percent;
            const numeric = parseFloat(data.percent.replace("%", "")) || 0;
            progressBar.style.width = `${numeric}%`;
          }
          if (data.speed) metricSpeed.textContent = data.speed;
          if (data.eta) metricEta.textContent = data.eta;
          if (data.message) statusMsg.textContent = data.message;
        } else if (data.status === "finished") {
          updateDownloadBadge("Remuxing", "status-badge", "sparkle_20_regular");
          statusMsg.textContent = "Streams downloaded. Merging video and audio via FFmpeg...";
          progressBar.style.width = "99%";
        } else if (data.status === "completed") {
          updateDownloadBadge("Done", "status-badge completed", "checkmark_20_regular");
          progressBar.style.width = "100%";
          metricPercent.textContent = "100%";
          metricEta.textContent = "00:00";
          statusMsg.textContent = "Video successfully saved into Downloads/ytdownload!";
          submitBtn.disabled = false;
          if (submitBtnText) submitBtnText.textContent = "Start Download";
          spinner.classList.remove("active");
          if (btnIcon) btnIcon.style.display = "inline-flex";
          eventSource.close();
          loadRecentDownloads();
          showToast("Video downloaded successfully!", "success");
        } else if (data.status === "failed") {
          updateDownloadBadge("Failed", "status-badge failed", "arrow_download_20_regular");
          statusMsg.textContent = data.error || "An error occurred during extraction.";
          submitBtn.disabled = false;
          if (submitBtnText) submitBtnText.textContent = "Start Download";
          spinner.classList.remove("active");
          if (btnIcon) btnIcon.style.display = "inline-flex";
          eventSource.close();
          showToast(data.error || "Download failed.", "error");
        }
      } catch {
        // Continue processing
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      submitBtn.disabled = false;
      if (submitBtnText) submitBtnText.textContent = "Start Download";
      spinner.classList.remove("active");
      if (btnIcon) btnIcon.style.display = "inline-flex";
    };
  }
}

/* Enhance Submission and SSE Progress Listener */
function initializeEnhanceHandler() {
  const enhanceForm = document.getElementById("enhance-form");
  const sourceInput = document.getElementById("enhance-source-input");
  const startTimeInput = document.getElementById("enhance-start-time");
  const endTimeInput = document.getElementById("enhance-end-time");
  const bitrateInput = document.getElementById("enhance-bitrate-input");
  const submitBtn = document.getElementById("start-enhance-btn");
  const submitBtnText = document.getElementById("enhance-btn-text");
  const spinner = document.getElementById("enhance-spinner");
  const btnIcon = document.getElementById("enhance-btn-icon");

  const statusCard = document.getElementById("enhance-status-card");
  const statusBadge = document.getElementById("enhance-status-badge");
  const statusBadgeIcon = document.getElementById("enhance-status-badge-icon");
  const statusBadgeText = document.getElementById("enhance-status-badge-text");
  const filenameDisplay = document.getElementById("enhance-filename-display");
  const progressBar = document.getElementById("enhance-progress-bar");
  const metricPercent = document.getElementById("enhance-metric-percent");
  const metricSpeed = document.getElementById("enhance-metric-speed");
  const metricEta = document.getElementById("enhance-metric-eta");
  const statusMsg = document.getElementById("enhance-status-msg");
  const outputPathBox = document.getElementById("enhance-output-path-box");
  const outputPathVal = document.getElementById("enhance-output-path");
  const previewOutputBtn = document.getElementById("preview-output-btn");

  if (!enhanceForm) return;

  function updateEnhanceBadge(statusText, badgeClass = "status-badge", iconName = "wand_20_regular") {
    if (statusBadge) statusBadge.className = badgeClass;
    if (statusBadgeText) statusBadgeText.textContent = statusText;
    if (statusBadgeIcon) {
      statusBadgeIcon.setAttribute("data-fluent", iconName);
      applyFluentIcons(statusBadge);
    }
  }

  enhanceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sourcePath = sourceInput.value.trim();
    if (!sourcePath) {
      showToast("Please upload a video file or provide an absolute path first.", "error");
      return;
    }

    const selectedMode = document.querySelector("input[name='enhance-mode']:checked").value;
    const payload = {
      source_path: sourcePath,
      start_time: startTimeInput.value.trim() || null,
      end_time: endTimeInput.value.trim() || null,
      mode: selectedMode,
      bitrate: bitrateInput ? bitrateInput.value.trim() || "25M" : "25M",
    };

    submitBtn.disabled = true;
    if (submitBtnText) submitBtnText.textContent = "Remastering Video...";
    spinner.classList.add("active");
    if (btnIcon) btnIcon.style.display = "none";
    statusCard.style.display = "flex";
    outputPathBox.style.display = "none";

    updateEnhanceBadge("Initializing", "status-badge", "wand_20_regular");
    filenameDisplay.textContent = sourcePath.split(/[\\/]/).pop() || "Video";
    if (progressBar) progressBar.style.width = "0%";
    if (metricPercent) metricPercent.textContent = "0%";
    if (metricSpeed) metricSpeed.textContent = "Initializing...";
    if (metricEta) metricEta.textContent = "Estimating...";
    statusMsg.textContent = "Probing video integrity and initializing GPU encoder...";

    try {
      const response = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Server rejected enhance request.");
      }

      const { job_id } = await response.json();
      attachEnhanceEventSource(job_id);
    } catch (err) {
      updateEnhanceBadge("Error", "status-badge failed", "wand_20_regular");
      statusMsg.textContent = err.message;
      submitBtn.disabled = false;
      if (submitBtnText) submitBtnText.textContent = "Process & Enhance Video";
      spinner.classList.remove("active");
      if (btnIcon) btnIcon.style.display = "inline-flex";
      showToast(err.message, "error");
    }
  });

  function attachEnhanceEventSource(jobId) {
    const eventSource = new EventSource(`/api/enhance/stream/${jobId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === "processing" || data.status === "starting") {
          updateEnhanceBadge("Remastering", "status-badge", "wand_20_regular");

          if (data.percent) {
            if (metricPercent) metricPercent.textContent = data.percent;
            const num = parseFloat(data.percent.replace("%", "")) || 0;
            if (progressBar) progressBar.style.width = `${num}%`;
          }
          if (data.speed && metricSpeed) metricSpeed.textContent = data.speed;
          if (data.eta && metricEta) metricEta.textContent = data.eta;
          if (data.message && statusMsg) statusMsg.textContent = data.message;
        } else if (data.status === "completed") {
          updateEnhanceBadge("Done", "status-badge completed", "checkmark_20_regular");
          if (progressBar) progressBar.style.width = "100%";
          if (metricPercent) metricPercent.textContent = "100%";
          if (metricEta) metricEta.textContent = "00:00";
          if (statusMsg) statusMsg.textContent = data.message || "Video processed successfully.";

          if (data.output_path) {
            outputPathBox.style.display = "flex";
            outputPathVal.textContent = data.output_path;

            if (previewOutputBtn) {
              previewOutputBtn.onclick = () => {
                loadVideoPreview(data.output_path, data.output_path.split(/[\\/]/).pop());
              };
            }
          }

          submitBtn.disabled = false;
          if (submitBtnText) submitBtnText.textContent = "Process & Enhance Video";
          spinner.classList.remove("active");
          if (btnIcon) btnIcon.style.display = "inline-flex";
          eventSource.close();
          loadRecentDownloads();
          showToast("Video processing completed successfully!", "success");
        } else if (data.status === "failed") {
          updateEnhanceBadge("Failed", "status-badge failed", "wand_20_regular");
          statusMsg.textContent = data.error || "FFmpeg processing encountered an error.";
          submitBtn.disabled = false;
          if (submitBtnText) submitBtnText.textContent = "Process & Enhance Video";
          spinner.classList.remove("active");
          if (btnIcon) btnIcon.style.display = "inline-flex";
          eventSource.close();
          showToast(data.error || "Video enhancement failed.", "error");
        }
      } catch {
        // Continue processing
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      submitBtn.disabled = false;
      if (submitBtnText) submitBtnText.textContent = "Process & Enhance Video";
      spinner.classList.remove("active");
      if (btnIcon) btnIcon.style.display = "inline-flex";
    };
  }
}

/* Sorting Controller */
function initializeRecentSortHandler() {
  const sortSelect = document.getElementById("recent-sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      renderRecentDownloads();
    });
  }
}

/* Fetch and Cache Recent Downloads */
async function loadRecentDownloads() {
  const countBadge = document.getElementById("recent-count");

  try {
    const response = await fetch("/api/recent-downloads");
    if (!response.ok) return;

    const data = await response.json();
    cachedRecentFiles = data.files || [];

    if (countBadge) {
      countBadge.textContent = cachedRecentFiles.length;
    }

    renderRecentDownloads();
  } catch {
    const container = document.getElementById("recent-downloads-list");
    if (container) {
      container.innerHTML = '<div class="empty-list-placeholder"><span class="empty-title">Failed to query download directory</span></div>';
    }
  }
}

/* Render Recent Downloads with Windows 11 Fluent Item Cards & Minimal Empty State */
function renderRecentDownloads() {
  const container = document.getElementById("recent-downloads-list");
  const sortSelect = document.getElementById("recent-sort-select");
  if (!container) return;

  if (cachedRecentFiles.length === 0) {
    container.innerHTML = `
      <div class="empty-list-placeholder">
        <div class="empty-icon-circle">
          <span class="empty-placeholder-icon" data-fluent="video_clip_24_regular"></span>
        </div>
        <span class="empty-title">Your library is empty</span>
        <span class="empty-desc">Videos downloaded from YouTube or enhanced clips will appear here.</span>
        <button type="button" class="empty-action-btn" id="empty-open-folder-btn">
          <span class="empty-btn-icon" data-fluent="folder_open_20_regular"></span>
          <span>Open Downloads folder</span>
        </button>
      </div>
    `;
    const emptyBtn = document.getElementById("empty-open-folder-btn");
    if (emptyBtn) {
      emptyBtn.addEventListener("click", async () => {
        try {
          await fetch("/api/open-downloads-folder", { method: "POST" });
        } catch (err) {
          console.error("Failed to open downloads folder:", err);
        }
      });
    }
    applyFluentIcons(container);
    return;
  }

  const sortMode = sortSelect ? sortSelect.value : "newest";
  const filesCopy = [...cachedRecentFiles];

  if (sortMode === "newest") {
    filesCopy.sort((a, b) => b.modified_timestamp - a.modified_timestamp);
  } else if (sortMode === "oldest") {
    filesCopy.sort((a, b) => a.modified_timestamp - b.modified_timestamp);
  } else if (sortMode === "name") {
    filesCopy.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortMode === "size") {
    filesCopy.sort((a, b) => b.size_mb - a.size_mb);
  }

  container.innerHTML = "";
  filesCopy.forEach((file) => {
    const item = document.createElement("div");
    item.className = "recent-item";

    const itemTop = document.createElement("div");
    itemTop.className = "recent-item-top";

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const isAudio = ext === "m4a" || ext === "mp3";
    const iconName = isAudio ? "music_note_2_20_regular" : "video_clip_20_regular";

    const iconDiv = document.createElement("div");
    iconDiv.className = "recent-file-icon";
    iconDiv.setAttribute("data-fluent", iconName);

    const info = document.createElement("div");
    info.className = "recent-file-info";

    const name = document.createElement("span");
    name.className = "recent-name";
    name.textContent = file.name;
    name.title = file.name;

    const timeRow = document.createElement("div");
    timeRow.className = "recent-timestamp-row";

    const sizeBadge = document.createElement("span");
    sizeBadge.className = "recent-size-badge";
    sizeBadge.textContent = `${file.size_mb} MB`;

    const separator = document.createElement("span");
    separator.textContent = "•";

    const dateSpan = document.createElement("span");
    dateSpan.textContent = file.modified_formatted || "Recent";

    timeRow.appendChild(sizeBadge);
    timeRow.appendChild(separator);
    timeRow.appendChild(dateSpan);

    info.appendChild(name);
    info.appendChild(timeRow);

    itemTop.appendChild(iconDiv);
    itemTop.appendChild(info);

    const actionsRow = document.createElement("div");
    actionsRow.className = "recent-actions-row";

    // Reveal in Windows Explorer Action Button
    const explorerBtn = document.createElement("button");
    explorerBtn.className = "recent-btn btn-explorer";
    explorerBtn.innerHTML = `${window.FLUENT_ICONS ? window.FLUENT_ICONS['folder_open_20_regular'] : ''}<span>Explorer</span>`;
    explorerBtn.title = "Reveal in Windows File Explorer";
    explorerBtn.addEventListener("click", async () => {
      await revealFileInExplorer(file.path, explorerBtn);
    });

    // Preview Action Button
    const previewBtn = document.createElement("button");
    previewBtn.className = "recent-btn btn-preview";
    previewBtn.innerHTML = `${window.FLUENT_ICONS ? window.FLUENT_ICONS['play_20_regular'] : ''}<span>Preview</span>`;
    previewBtn.title = "Preview video in player";
    previewBtn.addEventListener("click", () => {
      sendToEnhancer(file.path, true);
    });

    // Enhance Action Button
    const enhanceBtn = document.createElement("button");
    enhanceBtn.className = "recent-btn btn-enhance";
    enhanceBtn.innerHTML = `${window.FLUENT_ICONS ? window.FLUENT_ICONS['wand_20_regular'] : ''}<span>Enhance</span>`;
    enhanceBtn.title = "Load into Enhancer tab";
    enhanceBtn.addEventListener("click", () => {
      sendToEnhancer(file.path, false);
    });

    // Delete Action Button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "recent-btn btn-delete";
    deleteBtn.innerHTML = `${window.FLUENT_ICONS ? window.FLUENT_ICONS['delete_20_regular'] : ''}<span>Delete</span>`;
    deleteBtn.title = "Delete file from downloads folder";
    deleteBtn.addEventListener("click", async () => {
      await deleteDownloadedFile(file.path, file.name);
    });

    actionsRow.appendChild(explorerBtn);
    actionsRow.appendChild(previewBtn);
    actionsRow.appendChild(enhanceBtn);
    actionsRow.appendChild(deleteBtn);

    item.appendChild(itemTop);
    item.appendChild(actionsRow);
    container.appendChild(item);
  });

  applyFluentIcons(container);
}

/* Call backend API to delete a file from the downloads folder */
async function deleteDownloadedFile(filePath, fileName) {
  try {
    const res = await fetch("/api/delete-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(`Delete error: ${err.detail || "Failed to delete file"}`, "error");
      return;
    }

    showToast(`Deleted ${fileName}`, "info");
    loadRecentDownloads();
  } catch (err) {
    showToast(`Could not delete: ${err.message}`, "error");
  }
}

/* Call backend API to reveal file in Windows Explorer */
async function revealFileInExplorer(filePath, buttonElement) {
  try {
    const originalContent = buttonElement.innerHTML;
    buttonElement.innerHTML = `${window.FLUENT_ICONS ? window.FLUENT_ICONS['checkmark_20_regular'] : ''}<span>Opening...</span>`;

    const response = await fetch("/api/reveal-in-explorer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    });

    setTimeout(() => {
      buttonElement.innerHTML = originalContent;
    }, 1200);

    if (!response.ok) {
      const errorData = await response.json();
      showToast(`Explorer: ${errorData.detail || "Item not found"}`, "error");
    } else {
      showToast("Revealed item in Windows File Explorer", "success");
    }
  } catch (err) {
    showToast(`Could not reveal in Explorer: ${err.message}`, "error");
  }
}

/* Transmit Selected File Path to Enhancer Tab */
function sendToEnhancer(filePath, shouldPreview) {
  const enhanceTabBtn = document.getElementById("tab-btn-enhancer");
  const sourceInput = document.getElementById("enhance-source-input");

  if (sourceInput) {
    sourceInput.value = filePath;
  }

  if (shouldPreview) {
    const displayName = filePath.split(/[\\/]/).pop();
    loadVideoPreview(filePath, displayName);
  }

  if (enhanceTabBtn) {
    enhanceTabBtn.click();
  }
}
