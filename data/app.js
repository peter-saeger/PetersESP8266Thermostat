let ws = null;
let chart = null;
let pollTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  initChart();
  initWebSocket();
  fetchStatus();
  fetchHistory();
  initDial();
});

// Circular Dial Math & Drag Logic
function valToXY(val) {
  const min = 40, max = 90;
  const clamped = Math.max(min, Math.min(max, val));
  const percent = (clamped - min) / (max - min);
  const angleDeg = 225 + (percent * 270);
  const angleRad = angleDeg * Math.PI / 180;
  return {
    x: 100 + 90 * Math.sin(angleRad),
    y: 100 - 90 * Math.cos(angleRad)
  };
}

function xyToVal(x, y) {
  const dx = x - 100;
  const dy = 100 - y;
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
  const p1 = valToXY(low);
  const p2 = valToXY(high);
  const diff = high - low;
  const range = 50; 
  const angleDiff = (diff / range) * 270;
  const largeArcFlag = angleDiff > 180 ? 1 : 0;
  
  const track = document.getElementById('activeTrack');
  if (track) {
    if (diff <= 0) {
      track.setAttribute('d', '');
    } else {
      track.setAttribute('d', `M ${p1.x} ${p1.y} A 90 90 0 ${largeArcFlag} 1 ${p2.x} ${p2.y}`);
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
    if (activeHandle) activeHandle = null;
  }
  
  // Also update handles when inputs change manually
  document.getElementById('lowTempInput').addEventListener('input', updateHandles);
  document.getElementById('highTempInput').addEventListener('input', updateHandles);
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
    document.getElementById("currentTemp").textContent = parseFloat(data.temperature).toFixed(0);
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
    const heatStatus = document.getElementById("heatStatus");

    if (isHeating) {
      if (dialInner) dialInner.classList.add("heating");
      heatStatus.classList.add("heating");
      heatStatus.textContent = "HEATING";
    } else {
      if (dialInner) dialInner.classList.remove("heating");
      heatStatus.classList.remove("heating");
      heatStatus.textContent = "STANDBY";
    }
  }

  if (data.ip) document.getElementById("sysIp").textContent = data.ip;
  if (data.rssi) document.getElementById("sysRssi").textContent = data.rssi;
  if (data.uptime) {
    const secs = parseInt(data.uptime, 10);
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    document.getElementById("sysUptime").textContent = `${hrs}h ${mins}m`;
  }
}

async function saveBounds() {
  const lowVal = parseFloat(document.getElementById("lowTempInput").value);
  const highVal = parseFloat(document.getElementById("highTempInput").value);
  const feedback = document.getElementById("formFeedback");
  const saveBtn = document.getElementById("saveBtn");

  if (lowVal >= highVal) {
    feedback.className = "form-feedback error";
    feedback.textContent = "Low bound must be lower than High bound!";
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
      feedback.textContent = "Bounds updated successfully!";
      setTimeout(() => { feedback.textContent = ""; }, 3000);
    } else {
      throw new Error("HTTP " + res.status);
    }
  } catch (err) {
    feedback.className = "form-feedback error";
    feedback.textContent = "Failed to update bounds. Check network.";
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
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: "Heater On",
          data: [],
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.2)",
          borderWidth: 1,
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
