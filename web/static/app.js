/*
Implementation details:
Client-side presentation logic managing tab state transitions, dynamic click ripples,
Server-Sent Events (SSE) telemetry listeners, and API communications.
Eliminates external UI dependencies by executing purely on native browser APIs.
*/

document.addEventListener("DOMContentLoaded", () => {
  initializeTabs();
  initializeClickRipples();
  initializePasteButton();
  initializeModeSelector();
  initializeDownloadHandler();
  initializeEnhanceHandler();
  loadRecentDownloads();

  const refreshBtn = document.getElementById("refresh-recent-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadRecentDownloads);
  }
});

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

  if (!enhanceForm) return;

  enhanceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sourcePath = sourceInput.value.trim();
    if (!sourcePath) return;

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
  if (!container) return;

  try {
    const response = await fetch("/api/recent-downloads");
    if (!response.ok) return;

    const data = await response.json();
    const files = data.files || [];

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
      meta.textContent = `${file.size_mb} MB • Click send to enhance`;

      info.appendChild(name);
      info.appendChild(meta);

      const sendBtn = document.createElement("button");
      sendBtn.className = "recent-send-btn";
      sendBtn.textContent = "Send to Enhancer";
      sendBtn.addEventListener("click", () => {
        sendToEnhancer(file.path);
      });

      item.appendChild(info);
      item.appendChild(sendBtn);
      container.appendChild(item);
    });
  } catch {
    container.innerHTML = '<div class="empty-list-placeholder">Failed to query download directory.</div>';
  }
}

/* Transmit Selected File Path to Enhancer Tab */
function sendToEnhancer(filePath) {
  const enhanceTabBtn = document.getElementById("tab-btn-enhancer");
  const sourceInput = document.getElementById("enhance-source-input");

  if (sourceInput) {
    sourceInput.value = filePath;
  }

  if (enhanceTabBtn) {
    enhanceTabBtn.click();
  }
}
