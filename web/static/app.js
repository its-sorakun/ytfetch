/*
Implementation details:
Client-side presentation logic managing dual-theme states, animated tab navigation,
dynamic click ripples, video file uploads with drag-and-drop, inline video playback previews,
timecode synchronization, and Server-Sent Events (SSE) telemetry listeners.
Executes purely using native modern browser APIs without external dependencies.
*/

document.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  initializeTabs();
  initializeClickRipples();
  initializePasteButton();
  initializeModeSelector();
  initializeVideoUploader();
  initializeVideoPreviewPlayer();
  initializeDownloadHandler();
  initializeEnhanceHandler();
  loadRecentDownloads();

  const refreshBtn = document.getElementById("refresh-recent-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadRecentDownloads);
  }
});

/* Light and Dark Theme Controller */
function initializeTheme() {
  const themeToggleBtn = document.getElementById("theme-toggle");
  const storedTheme = localStorage.getItem("media-suite-theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  const activeTheme = storedTheme || (systemPrefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", activeTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";

      document.documentElement.setAttribute("data-theme", nextTheme);
      localStorage.setItem("media-suite-theme", nextTheme);
    });
  }
}

/* Segmented Tab Navigation */
function initializeTabs() {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabPanels = document.querySelectorAll(".tab-panel");
  const tabSlider = document.getElementById("tab-slider");

  function updateSliderPosition(activeButton) {
    if (!activeButton || !tabSlider) return;
    const offsetLeft = activeButton.offsetLeft;
    const clientWidth = activeButton.clientWidth;
    tabSlider.style.transform = `translateX(${offsetLeft - 4}px)`;
    tabSlider.style.width = `${clientWidth}px`;
  }

  const initialActive = document.querySelector(".tab-button.active");
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
    });
  });

  window.addEventListener("resize", () => {
    const currentActive = document.querySelector(".tab-button.active");
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
      }, 650);

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

  if (pasteBtn && urlInput) {
    pasteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const clipboardText = await navigator.clipboard.readText();
        if (clipboardText) {
          urlInput.value = clipboardText.trim();
          urlInput.focus();
        }
      } catch {
        urlInput.focus();
      }
    });
  }
}

/* Mode Selection Toggle */
function initializeModeSelector() {
  const modeRadios = document.querySelectorAll("input[name='enhance-mode']");
  const customGroup = document.getElementById("bitrate-custom-group");

  modeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.value === "target_bitrate" && radio.checked) {
        customGroup.style.display = "flex";
      } else {
        customGroup.style.display = "none";
      }
    });
  });
}

/* File Upload & Drag-and-Drop Handler */
function initializeVideoUploader() {
  const dropzone = document.getElementById("upload-dropzone");
  const fileInput = document.getElementById("video-file-input");
  const overlay = document.getElementById("upload-progress-overlay");
  const overlayText = document.getElementById("upload-progress-text");
  const sourceInput = document.getElementById("enhance-source-input");

  const togglePathBtn = document.getElementById("toggle-path-input-btn");
  const pathContainer = document.getElementById("manual-path-container");
  const accordionArrow = document.getElementById("accordion-arrow");

  if (togglePathBtn && pathContainer) {
    togglePathBtn.addEventListener("click", () => {
      const isHidden = pathContainer.style.display === "none";
      pathContainer.style.display = isHidden ? "block" : "none";
      if (accordionArrow) {
        accordionArrow.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
      }
    });
  }

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", (e) => {
    if (e.target !== fileInput) {
      fileInput.click();
    }
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFileToServer(files[0]);
    }
  });

  fileInput.addEventListener("change", async () => {
    if (fileInput.files && fileInput.files.length > 0) {
      await uploadFileToServer(fileInput.files[0]);
    }
  });

  async function uploadFileToServer(file) {
    if (!file) return;

    overlay.style.display = "flex";
    overlayText.textContent = `Uploading ${file.name}...`;

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

      overlayText.textContent = "Upload successful!";
      setTimeout(() => {
        overlay.style.display = "none";
      }, 700);

      loadVideoPreview(result.path, result.filename);
      loadRecentDownloads();
    } catch (err) {
      alert(`Upload error: ${err.message}`);
      overlay.style.display = "none";
    }
  }
}

/* Helper: Format seconds to HH:MM:SS */
function formatSecondsToTimecode(totalSeconds) {
  const rounded = Math.floor(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  const paddedH = String(hours).padStart(2, "0");
  const paddedM = String(minutes).padStart(2, "0");
  const paddedS = String(seconds).padStart(2, "0");

  return `${paddedH}:${paddedM}:${paddedS}`;
}

/* Integrated Video Playback Preview Player */
function initializeVideoPreviewPlayer() {
  const videoPlayer = document.getElementById("inline-video-player");
  const playheadDisplay = document.getElementById("current-playhead-time");
  const durationDisplay = document.getElementById("preview-duration-text");
  const setStartBtn = document.getElementById("set-start-ts-btn");
  const setEndBtn = document.getElementById("set-end-ts-btn");
  const startInput = document.getElementById("enhance-start-time");
  const endInput = document.getElementById("enhance-end-time");

  if (!videoPlayer) return;

  videoPlayer.addEventListener("timeupdate", () => {
    if (playheadDisplay) {
      playheadDisplay.textContent = formatSecondsToTimecode(videoPlayer.currentTime);
    }
  });

  videoPlayer.addEventListener("loadedmetadata", () => {
    if (durationDisplay) {
      durationDisplay.textContent = formatSecondsToTimecode(videoPlayer.duration);
    }
  });

  if (setStartBtn && startInput) {
    setStartBtn.addEventListener("click", () => {
      startInput.value = formatSecondsToTimecode(videoPlayer.currentTime);
      startInput.focus();
    });
  }

  if (setEndBtn && endInput) {
    setEndBtn.addEventListener("click", () => {
      endInput.value = formatSecondsToTimecode(videoPlayer.currentTime);
      endInput.focus();
    });
  }

  const manualSourceInput = document.getElementById("enhance-source-input");
  if (manualSourceInput) {
    manualSourceInput.addEventListener("change", () => {
      const pathVal = manualSourceInput.value.trim();
      if (pathVal) {
        const displayName = pathVal.split(/[\\/]/).pop();
        loadVideoPreview(pathVal, displayName);
      }
    });
  }
}

/* Load media file into the preview player */
function loadVideoPreview(absolutePath, displayName) {
  const previewCard = document.getElementById("video-preview-card");
  const videoPlayer = document.getElementById("inline-video-player");
  const filenameText = document.getElementById("preview-filename-text");

  if (!previewCard || !videoPlayer) return;

  previewCard.style.display = "flex";
  filenameText.textContent = displayName || absolutePath.split(/[\\/]/).pop() || "Video Preview";

  const streamUrl = `/api/stream-video?path=${encodeURIComponent(absolutePath)}`;
  videoPlayer.src = streamUrl;
  videoPlayer.load();
}

/* Download Submission and SSE Progress Listener */
function initializeDownloadHandler() {
  const downloadForm = document.getElementById("download-form");
  const urlInput = document.getElementById("youtube-url-input");
  const submitBtn = document.getElementById("start-download-btn");
  const spinner = document.getElementById("download-spinner");

  const statusCard = document.getElementById("download-status-card");
  const statusBadge = document.getElementById("download-status-badge");
  const filenameDisplay = document.getElementById("download-filename-display");
  const progressBar = document.getElementById("download-progress-bar");
  const metricPercent = document.getElementById("metric-percent");
  const metricSpeed = document.getElementById("metric-speed");
  const metricEta = document.getElementById("metric-eta");
  const statusMsg = document.getElementById("download-status-msg");

  if (!downloadForm) return;

  downloadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    submitBtn.disabled = true;
    spinner.classList.add("active");
    statusCard.style.display = "flex";

    statusBadge.className = "status-badge";
    statusBadge.textContent = "Connecting";
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
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Server rejected download request.");
      }

      const { job_id } = await response.json();
      attachDownloadEventSource(job_id);
    } catch (err) {
      statusBadge.className = "status-badge failed";
      statusBadge.textContent = "Error";
      statusMsg.textContent = err.message;
      submitBtn.disabled = false;
      spinner.classList.remove("active");
    }
  });

  function attachDownloadEventSource(jobId) {
    const eventSource = new EventSource(`/api/download/stream/${jobId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === "downloading" || data.status === "starting") {
          statusBadge.className = "status-badge";
          statusBadge.textContent = "Downloading";

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
          statusBadge.textContent = "Remuxing";
          statusMsg.textContent = "Streams downloaded. Merging video and audio via FFmpeg...";
          progressBar.style.width = "99%";
        } else if (data.status === "completed") {
          statusBadge.className = "status-badge completed";
          statusBadge.textContent = "Done";
          progressBar.style.width = "100%";
          metricPercent.textContent = "100%";
          metricEta.textContent = "00:00";
          statusMsg.textContent = "Video successfully saved into Downloads/ytdownload!";
          submitBtn.disabled = false;
          spinner.classList.remove("active");
          eventSource.close();
          loadRecentDownloads();
        } else if (data.status === "failed") {
          statusBadge.className = "status-badge failed";
          statusBadge.textContent = "Failed";
          statusMsg.textContent = data.error || "An error occurred during extraction.";
          submitBtn.disabled = false;
          spinner.classList.remove("active");
          eventSource.close();
        }
      } catch (e) {
        // Continue processing incoming frames
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      submitBtn.disabled = false;
      spinner.classList.remove("active");
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
  const spinner = document.getElementById("enhance-spinner");

  const statusCard = document.getElementById("enhance-status-card");
  const statusBadge = document.getElementById("enhance-status-badge");
  const filenameDisplay = document.getElementById("enhance-filename-display");
  const statusMsg = document.getElementById("enhance-status-msg");
  const outputPathBox = document.getElementById("enhance-output-path-box");
  const outputPathVal = document.getElementById("enhance-output-path");
  const previewOutputBtn = document.getElementById("preview-output-btn");

  if (!enhanceForm) return;

  enhanceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sourcePath = sourceInput.value.trim();
    if (!sourcePath) {
      alert("Please upload a video file or provide an absolute path first.");
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
    spinner.classList.add("active");
    statusCard.style.display = "flex";
    outputPathBox.style.display = "none";

    statusBadge.className = "status-badge";
    statusBadge.textContent = "Processing";
    filenameDisplay.textContent = sourcePath.split(/[\\/]/).pop() || "Video";
    statusMsg.textContent = "Initializing FFmpeg filter pipeline...";

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
      statusBadge.className = "status-badge failed";
      statusBadge.textContent = "Error";
      statusMsg.textContent = err.message;
      submitBtn.disabled = false;
      spinner.classList.remove("active");
    }
  });

  function attachEnhanceEventSource(jobId) {
    const eventSource = new EventSource(`/api/enhance/stream/${jobId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === "processing" || data.status === "starting") {
          statusBadge.className = "status-badge";
          statusBadge.textContent = "Processing";
          if (data.message) statusMsg.textContent = data.message;
        } else if (data.status === "completed") {
          statusBadge.className = "status-badge completed";
          statusBadge.textContent = "Done";
          statusMsg.textContent = data.message || "Video processed successfully.";

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
          spinner.classList.remove("active");
          eventSource.close();
          loadRecentDownloads();
        } else if (data.status === "failed") {
          statusBadge.className = "status-badge failed";
          statusBadge.textContent = "Failed";
          statusMsg.textContent = data.error || "FFmpeg processing encountered an error.";
          submitBtn.disabled = false;
          spinner.classList.remove("active");
          eventSource.close();
        }
      } catch (e) {
        // Continue processing
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      submitBtn.disabled = false;
      spinner.classList.remove("active");
    };
  }
}

/* Fetch and Render Recent Downloads */
async function loadRecentDownloads() {
  const container = document.getElementById("recent-downloads-list");
  const countBadge = document.getElementById("recent-count");
  if (!container) return;

  try {
    const response = await fetch("/api/recent-downloads");
    if (!response.ok) return;

    const data = await response.json();
    const files = data.files || [];

    if (countBadge) {
      countBadge.textContent = files.length;
    }

    if (files.length === 0) {
      container.innerHTML = '<div class="empty-list-placeholder">No recent media files located in Downloads/ytdownload.</div>';
      return;
    }

    container.innerHTML = "";
    files.forEach((file) => {
      const item = document.createElement("div");
      item.className = "recent-item";

      const info = document.createElement("div");
      info.className = "recent-file-info";

      const name = document.createElement("span");
      name.className = "recent-name";
      name.textContent = file.name;

      const meta = document.createElement("span");
      meta.className = "recent-meta";
      meta.textContent = `${file.size_mb} MB`;

      info.appendChild(name);
      info.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "recent-actions";

      const previewBtn = document.createElement("button");
      previewBtn.className = "recent-preview-btn";
      previewBtn.textContent = "Preview";
      previewBtn.addEventListener("click", () => {
        sendToEnhancer(file.path, true);
      });

      const sendBtn = document.createElement("button");
      sendBtn.className = "recent-send-btn";
      sendBtn.textContent = "Enhance";
      sendBtn.addEventListener("click", () => {
        sendToEnhancer(file.path, false);
      });

      actions.appendChild(previewBtn);
      actions.appendChild(sendBtn);

      item.appendChild(info);
      item.appendChild(actions);
      container.appendChild(item);
    });
  } catch {
    container.innerHTML = '<div class="empty-list-placeholder">Failed to query download directory.</div>';
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
