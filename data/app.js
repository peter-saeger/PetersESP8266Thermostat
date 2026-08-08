let ws = null;
let chart = null;
let pollTimer = null;
let isPowerOn = true;
let isFreezeMode = false;
let savedNormalLow = 50;
let savedNormalHigh = 65;

document.addEventListener("DOMContentLoaded", () => {
  initChart();
  initWebSocket();
  fetchStatus();
  fetchHistory();
  initDial();
});

function onPowerToggleChange(checked) {
  isPowerOn = checked;
  const labelOff = document.getElementById("labelPowerOff");
  const labelOn = document.getElementById("labelPowerOn");
  const modeText = document.getElementById("modeStatusText");

  if (checked) {
    if (labelOff) labelOff.classList.remove("active");
    if (labelOn) labelOn.classList.add("active");
    if (modeText) modeText.textContent = isFreezeMode ? "FREEZE PROTECT (40-45°F)" : "SYSTEM ACTIVE";
  } else {
    if (labelOff) labelOff.classList.add("active");
    if (labelOn) labelOn.classList.remove("active");
    
    if (isFreezeMode) {
      isFreezeMode = false;
      const freezeToggle = document.getElementById("freezeToggle");
      if (freezeToggle) freezeToggle.checked = false;
      const labelNorm = document.getElementById("labelNormal");
      const labelFreeze = document.getElementById("labelFreeze");
      if (labelNorm) labelNorm.classList.add("active");
      if (labelFreeze) labelFreeze.classList.remove("active");
    }
    
    if (modeText) modeText.textContent = "HEATER POWER OFF";
  }

  saveBounds();
}

function onFreezeToggleChange(checked) {
  const lowInput = document.getElementById("lowTempInput");
  const highInput = document.getElementById("highTempInput");
  const modeText = document.getElementById("modeStatusText");
  const labelNorm = document.getElementById("labelNormal");
  const labelFreeze = document.getElementById("labelFreeze");
  const powerToggle = document.getElementById("powerToggle");

  if (checked) {
    // 1. If Freeze Protect is turned ON, force POWER switch to ON!
    if (!isPowerOn) {
      isPowerOn = true;
      if (powerToggle) powerToggle.checked = true;
      const labelPowerOff = document.getElementById("labelPowerOff");
      const labelPowerOn = document.getElementById("labelPowerOn");
      if (labelPowerOff) labelPowerOff.classList.remove("active");
      if (labelPowerOn) labelPowerOn.classList.add("active");
    }

    // 2. Stash custom normal range & set to 40°F / 45°F
    if (!isFreezeMode) {
      savedNormalLow = parseFloat(lowInput.value) || 50;
      savedNormalHigh = parseFloat(highInput.value) || 65;
    }
    isFreezeMode = true;
    lowInput.value = 40;
    highInput.value = 45;

    if (modeText) modeText.textContent = "FREEZE PROTECT (40-45°F)";
    if (labelNorm) labelNorm.classList.remove("active");
    if (labelFreeze) labelFreeze.classList.add("active");
  } else {
    // Return to Normal mode
    isFreezeMode = false;
    lowInput.value = savedNormalLow;
    highInput.value = savedNormalHigh;

    if (modeText) modeText.textContent = isPowerOn ? "SYSTEM ACTIVE" : "HEATER POWER OFF";
    if (labelNorm) labelNorm.classList.add("active");
    if (labelFreeze) labelFreeze.classList.remove("active");
  }

  updateHandles();
  saveBounds();
}

// Circular Dial Math & Drag Logic
function valToXY(val, radius = 66) {
  const min = 40, max = 90;
  const clamped = Math.max(min, Math.min(max, val));
  const percent = (clamped - min) / (max - min);
  const angleDeg = 225 + (percent * 270);
  const angleRad = angleDeg * Math.PI / 180;
  return {
    x: 120 + radius * Math.sin(angleRad),
    y: 120 - radius * Math.cos(angleRad)
  };
}

function xyToVal(x, y) {
  const dx = x - 120;
  const dy = 120 - y;
  let angleDeg = Math.atan2(dx, dy) * 180 / Math.PI;
  if (angleDeg < 0) angleDeg += 360;
  
  if (angleDeg > 135 && angleDeg < 180) angleDeg = 135;
  if (angleDeg >= 180 && angleDeg < 225) angleDeg = 225;
  if (angleDeg <= 135) angleDeg += 360;
  
  const min = 40, max = 90;
  let percent = (angleDeg - 225) / 270;
  percent = Math.max(0, Math.min(1, percent));
  return min + percent * (max - min);
}

function updateActiveTrack(low, high) {
  const radius = 66;
  const p1 = valToXY(low, radius);
  const p2 = valToXY(high, radius);
  const diff = high - low;
  const range = 50; 
  const angleDiff = (diff / range) * 270;
  const largeArcFlag = angleDiff > 180 ? 1 : 0;
  
  const track = document.getElementById('activeTrack');
  if (track) {
    if (diff <= 0) {
      track.setAttribute('d', '');
    } else {
      track.setAttribute('d', `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
    }
  }
}

function updateHandles() {
  const low = parseFloat(document.getElementById('lowTempInput').value) || 50;
  const high = parseFloat(document.getElementById('highTempInput').value) || 65;
  
  const p1 = valToXY(low);
  const lowHandle = document.getElementById('lowHandle');
  if (lowHandle) {
    lowHandle.setAttribute('cx', p1.x);
    lowHandle.setAttribute('cy', p1.y);
  }
  
  const p2 = valToXY(high);
  const highHandle = document.getElementById('highHandle');
  if (highHandle) {
    highHandle.setAttribute('cx', p2.x);
    highHandle.setAttribute('cy', p2.y);
  }
  
  updateActiveTrack(low, high);
}

function initDial() {
  const svg = document.getElementById('dialSvg');
  if (!svg) return;
  let activeHandle = null;
  
  svg.addEventListener('mousedown', startDrag);
  svg.addEventListener('touchstart', startDrag, {passive: false});
  window.addEventListener('mousemove', drag);
  window.addEventListener('touchmove', drag, {passive: false});
  window.addEventListener('mouseup', endDrag);
  window.addEventListener('touchend', endDrag);
  
  function startDrag(e) {
    const target = e.target;
    if (target.id === 'lowHandle' || target.id === 'highHandle') {
      activeHandle = target.id;
      e.preventDefault(); 
    }
  }
  
  function drag(e) {
    if (!activeHandle) return;
    e.preventDefault();
    
    const evt = e.touches ? e.touches[0] : e;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    let val = xyToVal(svgP.x, svgP.y);
    val = Math.round(val); // Step by 1
    
    if (activeHandle === 'lowHandle') {
      const high = parseFloat(document.getElementById('highTempInput').value) || 65;
      if (val >= high) val = high - 1;
      document.getElementById('lowTempInput').value = val.toFixed(0);
      document.getElementById('dispLowTemp').textContent = `${val.toFixed(0)}°F`;
    } else {
      const low = parseFloat(document.getElementById('lowTempInput').value) || 50;
      if (val <= low) val = low + 1;
      document.getElementById('highTempInput').value = val.toFixed(0);
      document.getElementById('dispHighTemp').textContent = `${val.toFixed(0)}°F`;
    }
    updateHandles();
  }
  
  function endDrag() {
    if (activeHandle) {
      activeHandle = null;
      saveBounds(); // Save immediately on release!
    }
  }
  
  // Also update handles and trigger debounced auto-save when inputs change manually
  document.getElementById('lowTempInput').addEventListener('input', () => {
    updateHandles();
    debouncedSaveBounds(800);
  });
  document.getElementById('highTempInput').addEventListener('input', () => {
    updateHandles();
    debouncedSaveBounds(800);
  });
  updateHandles();
}


// Step Button Handler
function stepBound(inputId, step) {
  const input = document.getElementById(inputId);
  if (!input) return;
  let val = parseFloat(input.value) || 0;
  val = Math.round(val);
  
  // Actually apply the step!
  val += step;
  
  const min = parseFloat(input.min) || 40;
  const max = parseFloat(input.max) || 90;
  
  if (inputId === 'lowTempInput') {
    const high = parseFloat(document.getElementById('highTempInput').value) || 65;
    if (val >= high) val = high - 1;
  } else {
    const low = parseFloat(document.getElementById('lowTempInput').value) || 50;
    if (val <= low) val = low + 1;
  }
  
  if (val >= min && val <= max) {
    input.value = val.toFixed(0);
    updateHandles();
    debouncedSaveBounds(600);
  }
}

// Initialize WebSocket Connection
function initWebSocket() {
  const wsHost = window.location.hostname || "192.168.10.77";
  const wsUrl = `ws://${wsHost}:81`;

  const badge = document.getElementById("connectionBadge");
  if (badge) {
    badge.className = "badge badge-connecting";
    badge.textContent = "Connecting...";
  }

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("[WS] Connected to ESP8266 WebSocket Server");
    if (badge) {
      badge.className = "badge badge-live";
      badge.textContent = "Connected";
    }
    if (pollTimer) clearInterval(pollTimer);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "status" || data.temperature !== undefined) {
        updateUI(data);
      }
    } catch (e) {
      console.error("[WS] Failed to parse message:", e);
    }
  };

  ws.onclose = () => {
    console.warn("[WS] Disconnected. Falling back to HTTP polling...");
    if (badge) {
      badge.className = "badge badge-connecting";
      badge.textContent = "Connecting...";
    }
    setTimeout(initWebSocket, 5000);
    if (!pollTimer) {
      pollTimer = setInterval(fetchStatus, 3000);
    }
  };

  ws.onerror = (err) => {
    console.error("[WS] Error:", err);
    ws.close();
  };
}

async function fetchStatus() {
  try {
    const res = await fetch("/api/status");
    if (res.ok) {
      const data = await res.json();
      updateUI(data);
    }
  } catch (err) {
    console.error("[API] Status fetch failed:", err);
  }
}

function updateUI(data) {
  if (data.temperature !== undefined) {
    const tempNum = parseFloat(data.temperature);
    document.getElementById("currentTemp").textContent = tempNum.toFixed(0);

    const p = valToXY(tempNum);
    const needle = document.getElementById("tempNeedle");
    if (needle) {
      needle.setAttribute("x2", p.x);
      needle.setAttribute("y2", p.y);
    }
  }

  if (data.lowTemp !== undefined) {
    const lowVal = parseFloat(data.lowTemp).toFixed(0);
    document.getElementById("dispLowTemp").textContent = `${lowVal}°F`;
    if (document.activeElement !== document.getElementById("lowTempInput")) {
      document.getElementById("lowTempInput").value = lowVal;
    }
  }

  if (data.highTemp !== undefined) {
    const highVal = parseFloat(data.highTemp).toFixed(0);
    document.getElementById("dispHighTemp").textContent = `${highVal}°F`;
    if (document.activeElement !== document.getElementById("highTempInput")) {
      document.getElementById("highTempInput").value = highVal;
    }
  }

  updateHandles();

  if (data.relayStatus !== undefined) {
    const isHeating = data.relayStatus === 1 || data.relayStatus === true;
    const dialInner = document.getElementById("dialInner");
    const lampBezel = document.getElementById("lampBezel") || document.getElementById("statusLamp");
    const heatStatusText = document.getElementById("heatStatusText");

    if (isHeating) {
      if (dialInner) dialInner.classList.add("heating");
      if (lampBezel) lampBezel.classList.add("heating");
      if (heatStatusText) heatStatusText.textContent = "HEATING";
    } else {
      if (dialInner) dialInner.classList.remove("heating");
      if (lampBezel) lampBezel.classList.remove("heating");
      if (heatStatusText) heatStatusText.textContent = "STANDBY";
    }
  }

  if (data.ip) document.getElementById("sysIp").textContent = data.ip;
  if (data.rssi !== undefined) {
    document.getElementById("sysRssi").textContent = data.rssi;
    const dispRssiVal = document.getElementById("dispRssiVal");
    if (dispRssiVal) dispRssiVal.textContent = `${data.rssi} dBm`;

    const miniNeedle = document.getElementById("miniNeedle");
    if (miniNeedle) {
      const rssiClamped = Math.max(-90, Math.min(-30, parseInt(data.rssi, 10)));
      const pct = (rssiClamped - (-90)) / 60;
      const angleRad = (225 + pct * 270) * Math.PI / 180;
      miniNeedle.setAttribute("x2", 50 + 26 * Math.sin(angleRad));
      miniNeedle.setAttribute("y2", 50 - 26 * Math.cos(angleRad));
    }
  }
  if (data.uptime) {
    const secs = parseInt(data.uptime, 10);
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    document.getElementById("sysUptime").textContent = `${hrs}h ${mins}m`;
  }
}

let saveTimer = null;

function debouncedSaveBounds(delayMs = 600) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveBounds();
  }, delayMs);
}

async function saveBounds() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const lowVal = parseFloat(document.getElementById("lowTempInput").value);
  const highVal = parseFloat(document.getElementById("highTempInput").value);
  const feedback = document.getElementById("formFeedback");
  const saveBtn = document.getElementById("saveBtn");

  if (lowVal >= highVal) {
    feedback.className = "form-feedback error";
    feedback.textContent = "Low setting must be lower than High setting!";
    return;
  }

  feedback.className = "form-feedback";
  feedback.textContent = "Saving...";
  saveBtn.disabled = true;

  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lowTemp: lowVal, highTemp: highVal }),
    });

    if (res.ok) {
      feedback.className = "form-feedback success";
      feedback.textContent = "Settings updated successfully!";
      setTimeout(() => { feedback.textContent = ""; }, 3000);
    } else {
      throw new Error("HTTP " + res.status);
    }
  } catch (err) {
    feedback.className = "form-feedback error";
    feedback.textContent = "Failed to update settings. Check network.";
  } finally {
    saveBtn.disabled = false;
  }
}

function initChart() {
  const ctx = document.getElementById("tempChart");
  if (!ctx || typeof Chart === "undefined") return;

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Temperature (°F)",
          data: [],
          borderColor: "#ff9e00",
          backgroundColor: "rgba(255, 158, 0, 0.12)",
          borderWidth: 2.5,
          fill: true,
          tension: 0.3,
          pointRadius: 2.5,
        },
        {
          label: "Heater On",
          data: [],
          borderColor: "#f55300",
          backgroundColor: "rgba(245, 83, 0, 0.25)",
          borderWidth: 1.5,
          fill: true,
          stepped: true,
          pointRadius: 0,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8", maxTicksLimit: 8 }
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8" }
        }
      },
      plugins: {
        legend: { labels: { color: "#f8fafc" } },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false
        }
      },
      interaction: {
        mode: 'index',
        intersect: false,
      }
    }
  });
}

async function fetchHistory() {
  if (!chart) return;
  try {
    const res = await fetch("/api/history");
    if (res.ok) {
      const data = await res.json();
      if (data.history && Array.isArray(data.history)) {
        const labels = data.history.map(pt => {
          const m = Math.floor(pt.time / 60);
          return `-${m}m`;
        });
        const temps = data.history.map(pt => parseFloat(pt.temp));
        const heatStates = data.history.map(pt => pt.relay ? 65 : null);

        chart.data.labels = labels;
        chart.data.datasets[0].data = temps;
        chart.update();
      }
    }
  } catch (err) {
    console.warn("[API] History fetch failed:", err);
  }
}

// Export for Node.js (Jest Testing) without breaking Browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { valToXY, xyToVal };
}
