// Serial port variable
let port;
const BAUDRATE = 115200;

// Maximum number of streams
const MAX_STREAMS = 6;

// Data storage for multiple streams
let streams = {}; // Key: stream ID (1-6), Value: stream object
let maxDataPoints = 200;

// Performance monitoring
let messageCount = 0;
let lastLogTime = 0;
let messagesPerSecond = 0;
let bufferBacklogDetected = false;
let consecutiveBacklogFrames = 0;

// Message processing limits to prevent overload
const MAX_MESSAGES_PER_FRAME = 20; // Process max 20 messages per frame (increased to handle catch-up better)
const AUTO_CLEAR_THRESHOLD = 60; // Auto-clear buffer if backlogged for 60 frames (~1 second)

// Stream class to manage individual stream data
class DataStream {
  constructor(id) {
    this.id = id;
    this.xData = [];
    this.yData = [];
    this.zData = [];

    // Visibility toggles
    this.showX = true;
    this.showY = true;
    this.showZ = true;

    // Calibration baseline values
    this.baselineX = 0;
    this.baselineY = 0;
    this.baselineZ = 0;
    this.isCalibrated = false;

    // Auto-mapping variables for range
    this.maxDeviationX = 1000;
    this.maxDeviationY = 1000;
    this.maxDeviationZ = 1000;

    // Smoothing variables
    this.smoothedX = 0;
    this.smoothedY = 0;
    this.smoothedZ = 0;
    this.smoothingFactor = 0.2;

    // Calibration noise measurement
    this.isCalibrating = false;
    this.calibrationSamples = [];
    this.calibrationFrames = 0;

    // Noise threshold
    this.noiseThresholdX = 0;
    this.noiseThresholdY = 0;
    this.noiseThresholdZ = 0;

    // Color gradient for this stream
    this.colors = this.getColorGradient(id);

    // Last update timestamp
    this.lastUpdate = Date.now();
  }

  // Get color gradient based on stream ID
  getColorGradient(id) {
    const gradients = [
      // Stream 1: Shades of blue (light to dark)
      { x: [135, 206, 250], y: [70, 130, 180], z: [25, 25, 112] },
      // Stream 2: Shades of green (light to dark)
      { x: [144, 238, 144], y: [60, 179, 113], z: [0, 100, 0] },
      // Stream 3: Shades of orange (light to dark)
      { x: [255, 180, 100], y: [255, 140, 60], z: [255, 100, 20] },
      // Stream 4: Shades of purple (light to dark)
      { x: [216, 191, 216], y: [147, 112, 219], z: [75, 0, 130] },
      // Stream 5: Shades of pink (light to dark)
      { x: [255, 182, 193], y: [255, 105, 180], z: [199, 21, 133] },
      // Stream 6: Shades of yellow/amber (light to dark)
      { x: [255, 255, 153], y: [255, 215, 0], z: [218, 165, 32] },
    ];
    return gradients[(id - 1) % gradients.length];
  }

  // Add data point
  addDataPoint(x, y, z) {
    // Apply deadzone if calibrated
    if (this.isCalibrated) {
      let deviationX = x - this.baselineX;
      let deviationY = y - this.baselineY;
      let deviationZ = z - this.baselineZ;

      if (Math.abs(deviationX) < this.noiseThresholdX) x = this.baselineX;
      if (Math.abs(deviationY) < this.noiseThresholdY) y = this.baselineY;
      if (Math.abs(deviationZ) < this.noiseThresholdZ) z = this.baselineZ;
    }

    // Add new data points
    this.xData.push(x);
    this.yData.push(y);
    this.zData.push(z);

    // Keep arrays at max length
    if (this.xData.length > maxDataPoints) {
      this.xData.shift();
      this.yData.shift();
      this.zData.shift();
    }

    // Update max deviations from baseline for auto-scaling
    if (this.isCalibrated) {
      let deviationX = Math.abs(x - this.baselineX);
      let deviationY = Math.abs(y - this.baselineY);
      let deviationZ = Math.abs(z - this.baselineZ);

      this.maxDeviationX = Math.max(this.maxDeviationX, deviationX);
      this.maxDeviationY = Math.max(this.maxDeviationY, deviationY);
      this.maxDeviationZ = Math.max(this.maxDeviationZ, deviationZ);
    }

    this.lastUpdate = Date.now();
  }

  // Start calibration
  startCalibration() {
    if (this.smoothedX !== 0 || this.smoothedY !== 0 || this.smoothedZ !== 0) {
      this.isCalibrating = true;
      this.calibrationSamples = [];
      this.calibrationFrames = 0;
      console.log(
        `Stream ${this.id}: Starting calibration... Keep device STILL`
      );
    }
  }

  // Add calibration sample
  addCalibrationSample(x, y, z) {
    this.calibrationSamples.push({ x: x, y: y, z: z });
    this.calibrationFrames++;

    if (this.calibrationFrames >= 30) {
      this.finishCalibration();
    }
  }

  // Finish calibration
  finishCalibration() {
    if (this.calibrationSamples.length < 30) {
      this.isCalibrating = false;
      return;
    }

    // Calculate standard deviation for each axis
    let stdX = this.calculateStdDev(this.calibrationSamples, "x");
    let stdY = this.calculateStdDev(this.calibrationSamples, "y");
    let stdZ = this.calculateStdDev(this.calibrationSamples, "z");
    let avgNoise = (stdX + stdY + stdZ) / 3;

    // Set noise thresholds
    this.noiseThresholdX = stdX * 2;
    this.noiseThresholdY = stdY * 2;
    this.noiseThresholdZ = stdZ * 2;

    // Set smoothing factor based on noise
    this.smoothingFactor = map(avgNoise, 5, 50, 0.05, 0.5);
    this.smoothingFactor = constrain(this.smoothingFactor, 0.05, 0.5);

    // Calculate baseline from average of samples
    let sumX = 0,
      sumY = 0,
      sumZ = 0;
    for (let sample of this.calibrationSamples) {
      sumX += sample.x;
      sumY += sample.y;
      sumZ += sample.z;
    }

    this.baselineX = sumX / this.calibrationSamples.length;
    this.baselineY = sumY / this.calibrationSamples.length;
    this.baselineZ = sumZ / this.calibrationSamples.length;

    // Set smoothed values to baseline
    this.smoothedX = this.baselineX;
    this.smoothedY = this.baselineY;
    this.smoothedZ = this.baselineZ;

    // Clear and fill with baseline values
    this.xData = [];
    this.yData = [];
    this.zData = [];
    for (let i = 0; i < maxDataPoints; i++) {
      this.xData.push(this.baselineX);
      this.yData.push(this.baselineY);
      this.zData.push(this.baselineZ);
    }

    // Reset max deviations
    this.maxDeviationX = 100;
    this.maxDeviationY = 100;
    this.maxDeviationZ = 100;

    this.isCalibrated = true;
    this.isCalibrating = false;

    console.log(
      `Stream ${
        this.id
      }: Calibrated! Baseline set. Smoothing: ${this.smoothingFactor.toFixed(
        3
      )}`
    );
  }

  // Calculate standard deviation
  calculateStdDev(samples, axis) {
    let values = samples.map((s) => s[axis]);
    let mean = values.reduce((a, b) => a + b, 0) / values.length;
    let variance =
      values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  // Check if stream is active (received data recently)
  isActive() {
    return Date.now() - this.lastUpdate < 5000; // 5 second timeout
  }
}

const CALIBRATION_DURATION = 30; // frames

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Cap frame rate to prevent wild fluctuations (600 FPS → 60 FPS causes issues)
  frameRate(60);

  // Initialize serial port
  port = createSerial();

  // Check for previously approved serial ports
  let usedPorts = usedSerialPorts();
  console.log("Previously used ports:", usedPorts);

  if (usedPorts.length > 0) {
    console.log("Attempting auto-connect to:", usedPorts[0]);
    port.open(usedPorts[0], BAUDRATE);
  }

  console.log("=== MULTI-STREAM ACCELEROMETER VISUALIZER ===");
  console.log("Supports up to 6 simultaneous data streams");
  console.log("\nControls:");
  console.log("  S - Connect to serial port");
  console.log("  C - Calibrate ALL active streams");
  console.log("  R - Clear serial buffer (auto-clears after 1 sec of backlog)");
  console.log("  1-6 - Toggle visibility for Stream 1-6");
  console.log("  + - Increase smoothing for all streams");
  console.log("  - - Decrease smoothing for all streams");
  console.log("\nStream Protocol:");
  console.log("  Registration: Send 'S1' through 'S6' to register a stream");
  console.log("  Data: Send 'm1' through 'm6' followed by x=, y=, z= values");
  console.log(
    "\n💡 Tip: Buffer auto-clears if backlogged for >1 second to prevent freezing"
  );
}

function draw() {
  background(0);

  // Read serial data with frame limit to prevent overload
  if (port && port.opened()) {
    let messagesThisFrame = 0;

    // Process multiple messages per frame, but limit to prevent lag
    while (messagesThisFrame < MAX_MESSAGES_PER_FRAME) {
      let data = port.readUntil("\n");
      if (data !== null && data.length > 0) {
        parseSerialMessage(data.trim());
        messagesThisFrame++;
      } else {
        break; // No more messages available
      }
    }

    // Detect if we hit the limit (indicates buffer backlog)
    if (messagesThisFrame >= MAX_MESSAGES_PER_FRAME) {
      bufferBacklogDetected = true;
      consecutiveBacklogFrames++;

      // Auto-clear if backlogged for too long (prevents system freeze)
      if (consecutiveBacklogFrames >= AUTO_CLEAR_THRESHOLD) {
        console.log("⚠️ Auto-clearing buffer due to sustained backlog...");
        clearSerialBuffer();
        consecutiveBacklogFrames = 0;
      }
    } else {
      bufferBacklogDetected = false;
      consecutiveBacklogFrames = 0;
    }
  }

  // Draw graphs for all active streams
  drawAllGraphs();

  // Draw baseline indicator if any stream is calibrated
  let anyCalibrated = Object.values(streams).some((s) => s.isCalibrated);
  if (anyCalibrated) {
    drawBaseline();
  }

  // Draw status
  drawStatus();

  // Update performance stats
  updatePerformanceStats();
}

// Parse incoming serial message
function parseSerialMessage(message) {
  // Count messages for performance monitoring (don't log every message - it causes lag!)
  messageCount++;

  // Check for stream registration (S1-S6)
  let regMatch = message.match(/^S([1-6])$/);
  if (regMatch) {
    let streamId = parseInt(regMatch[1]);
    if (!streams[streamId]) {
      streams[streamId] = new DataStream(streamId);
      console.log(`✓ Stream ${streamId} registered`);
    }
    return;
  }

  // Check for data message (m1-m6)
  let dataMatch = message.match(/^m([1-6])/);
  if (dataMatch) {
    let streamId = parseInt(dataMatch[1]);

    // Auto-register if not already registered
    if (!streams[streamId]) {
      streams[streamId] = new DataStream(streamId);
      console.log(`✓ Stream ${streamId} auto-registered from data message`);
    }

    let stream = streams[streamId];

    // Extract x, y, z values
    let xMatch = message.match(/x=([^,\s]+)/);
    let yMatch = message.match(/y=([^,\s]+)/);
    let zMatch = message.match(/z=([^,\s]+)/);

    let x = xMatch ? parseFloat(xMatch[1]) : null;
    let y = yMatch ? parseFloat(yMatch[1]) : null;
    let z = zMatch ? parseFloat(zMatch[1]) : null;

    if (x === null || y === null || z === null) return;

    // If calibrating, collect samples
    if (stream.isCalibrating) {
      stream.addCalibrationSample(x, y, z);
      return;
    }

    // Initialize smoothed values on first read
    if (
      stream.smoothedX === 0 &&
      stream.smoothedY === 0 &&
      stream.smoothedZ === 0
    ) {
      stream.smoothedX = x;
      stream.smoothedY = y;
      stream.smoothedZ = z;
    } else {
      // Apply exponential smoothing
      stream.smoothedX = smoothValue(
        stream.smoothedX,
        x,
        stream.smoothingFactor
      );
      stream.smoothedY = smoothValue(
        stream.smoothedY,
        y,
        stream.smoothingFactor
      );
      stream.smoothedZ = smoothValue(
        stream.smoothedZ,
        z,
        stream.smoothingFactor
      );
    }

    // Add smoothed values to data arrays
    stream.addDataPoint(stream.smoothedX, stream.smoothedY, stream.smoothedZ);
  }
}

// Smoothing function
function smoothValue(currentSmoothed, newValue, factor) {
  return currentSmoothed + (newValue - currentSmoothed) * factor;
}

// Clear serial buffer (can be called manually or automatically)
function clearSerialBuffer() {
  if (!port || !port.opened()) return 0;

  let cleared = 0;
  const MAX_CLEAR = 1000; // Safety limit to prevent infinite loop

  // Read and discard all pending messages (with safety limit)
  while (cleared < MAX_CLEAR) {
    let msg = port.readUntil("\n");
    if (msg === null) break; // No more messages
    cleared++;
  }

  bufferBacklogDetected = false; // Reset warning flag
  consecutiveBacklogFrames = 0;

  console.log(
    `🗑️ Cleared ${cleared} buffered messages - should be real-time now`
  );

  if (cleared >= MAX_CLEAR) {
    console.log(
      "⚠️ Buffer was extremely full - may need to clear again if still delayed"
    );
  }

  return cleared;
}

// Update performance statistics
function updatePerformanceStats() {
  let currentTime = millis();

  // Update messages per second every second
  if (currentTime - lastLogTime >= 1000) {
    messagesPerSecond = messageCount;
    messageCount = 0;
    lastLogTime = currentTime;

    // Log performance stats periodically (every 5 seconds)
    if (
      messagesPerSecond > 0 &&
      int(currentTime / 5000) !== int((currentTime - 1000) / 5000)
    ) {
      console.log(
        `📊 Performance: ${messagesPerSecond} msg/sec | FPS: ${int(
          frameRate()
        )} | Active streams: ${
          Object.values(streams).filter((s) => s.isActive()).length
        }`
      );
    }
  }
}

// Draw graphs for all active streams
function drawAllGraphs() {
  strokeWeight(2);

  for (let streamId in streams) {
    let stream = streams[streamId];
    if (!stream.isActive()) continue;
    if (stream.xData.length < 2) continue;

    // Draw X data (light color)
    if (stream.showX) {
      stroke(stream.colors.x[0], stream.colors.x[1], stream.colors.x[2]);
      drawLine(stream.xData, stream.baselineX, stream.maxDeviationX);
    }

    // Draw Y data (medium color)
    if (stream.showY) {
      stroke(stream.colors.y[0], stream.colors.y[1], stream.colors.y[2]);
      drawLine(stream.yData, stream.baselineY, stream.maxDeviationY);
    }

    // Draw Z data (dark color)
    if (stream.showZ) {
      stroke(stream.colors.z[0], stream.colors.z[1], stream.colors.z[2]);
      drawLine(stream.zData, stream.baselineZ, stream.maxDeviationZ);
    }
  }
}

// Draw a single line with calibrated baseline positioning
function drawLine(data, baseline, maxDeviation) {
  noFill();
  beginShape();

  let baselineY = height * 0.9;
  let topY = height * 0.1;
  let scale = (baselineY - topY) / maxDeviation;

  for (let i = 0; i < data.length; i++) {
    let x = map(i, 0, maxDataPoints - 1, 0, width);
    let deviation = data[i] - baseline;
    let y = baselineY - deviation * scale;
    y = constrain(y, 0, height);
    vertex(x, y);
  }

  endShape();
}

// Draw baseline indicator
function drawBaseline() {
  let baselineY = height * 0.9;
  stroke(100, 100, 100);
  strokeWeight(1);
  line(0, baselineY, width, baselineY);

  fill(100, 100, 100);
  noStroke();
  textSize(10);
  textAlign(RIGHT, BOTTOM);
  text("baseline", width - 5, baselineY - 2);
}

// Draw status indicator
function drawStatus() {
  fill(255);
  noStroke();
  textSize(14);
  textAlign(LEFT, TOP);

  let y = 10;
  let lineHeight = 20;

  // Active streams count
  let activeStreams = Object.values(streams).filter((s) => s.isActive());
  text(`Active Streams: ${activeStreams.length}/${MAX_STREAMS}`, 10, y);
  y += lineHeight;

  // Individual stream status
  for (let streamId in streams) {
    let stream = streams[streamId];
    if (!stream.isActive()) continue;

    // Set color indicator
    let color = stream.colors.y; // Use middle color for label
    fill(color[0], color[1], color[2]);

    let statusText = `S${streamId}: `;

    // Calibration status
    if (stream.isCalibrating) {
      statusText += `CALIBRATING (${stream.calibrationFrames}/30)`;
    } else if (stream.isCalibrated) {
      statusText += "✓ Cal";
    } else {
      statusText += "Not Cal";
    }

    // Axes visibility
    let axes = [];
    if (stream.showX) axes.push("X");
    if (stream.showY) axes.push("Y");
    if (stream.showZ) axes.push("Z");
    statusText += ` | Axes: ${axes.join(",")}`;

    // Smoothing
    statusText += ` | Smooth: ${stream.smoothingFactor.toFixed(2)}`;

    text(statusText, 10, y);
    y += lineHeight;
  }

  // Performance stats
  fill(150);
  y += 10;
  textSize(12);
  text(
    `Performance: ${messagesPerSecond} msg/sec | FPS: ${int(frameRate())}`,
    10,
    y
  );
  y += lineHeight;

  // Buffer backlog warning
  if (bufferBacklogDetected) {
    fill(255, 150, 0); // Orange warning
    textSize(12);
    text(
      `⚠️ BUFFER BACKLOG (${consecutiveBacklogFrames}/${AUTO_CLEAR_THRESHOLD}) - Press R or wait for auto-clear`,
      10,
      y
    );
    y += lineHeight;
  }

  // Controls hint
  fill(150);
  textSize(12);
  text(
    "S=Serial | C=Calibrate | R=Clear Buffer | 1-6=Toggle | +/-=Smooth",
    10,
    y
  );
}

// Key press handler
function keyPressed() {
  // Serial connection
  if (key === "s" || key === "S") {
    if (!port.opened()) {
      port.open(BAUDRATE);
      console.log("Opening serial port...");
    } else {
      console.log("Port already open");
    }
  }

  // Calibrate all active streams
  if (key === "c" || key === "C") {
    let calibratedCount = 0;
    for (let streamId in streams) {
      let stream = streams[streamId];
      if (stream.isActive()) {
        stream.startCalibration();
        calibratedCount++;
      }
    }
    console.log(`Starting calibration for ${calibratedCount} active stream(s)`);
  }

  // Clear serial buffer (useful when there's lag/delay)
  if (key === "r" || key === "R") {
    clearSerialBuffer();
  }

  // Toggle individual stream visibility (1-6)
  if (key >= "1" && key <= "6") {
    let streamId = parseInt(key);
    if (streams[streamId]) {
      let stream = streams[streamId];
      // Toggle all axes for this stream
      let newState = !(stream.showX && stream.showY && stream.showZ);
      stream.showX = newState;
      stream.showY = newState;
      stream.showZ = newState;
      console.log(`Stream ${streamId} visibility: ${newState ? "ON" : "OFF"}`);
    } else {
      console.log(`Stream ${streamId} not registered yet`);
    }
  }

  // Increase smoothing for all streams
  if (key === "+" || key === "=") {
    for (let streamId in streams) {
      let stream = streams[streamId];
      stream.smoothingFactor = Math.max(0.05, stream.smoothingFactor - 0.05);
    }
    console.log("Smoothing increased for all streams");
  }

  // Decrease smoothing for all streams
  if (key === "-" || key === "_") {
    for (let streamId in streams) {
      let stream = streams[streamId];
      stream.smoothingFactor = Math.min(1.0, stream.smoothingFactor + 0.05);
    }
    console.log("Smoothing decreased for all streams");
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function doubleClicked() {
  let fs = fullscreen();
  fullscreen(!fs);
}
