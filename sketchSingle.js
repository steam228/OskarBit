// Serial port variable
let port;
const BAUDRATE = 115200;

// Graph data arrays
let xData = [];
let yData = [];
let zData = [];
let maxDataPoints = 200;

// Visibility toggles for each axis
let showX = true;
let showY = true;
let showZ = true;

// Calibration baseline values (set when C is pressed)
let baselineX = 0;
let baselineY = 0;
let baselineZ = 0;
let isCalibrated = false;

// Auto-mapping variables for range
let maxDeviationX = 1000; // Default range
let maxDeviationY = 1000;
let maxDeviationZ = 1000;

// Smoothing variables
let smoothedX = 0;
let smoothedY = 0;
let smoothedZ = 0;
let smoothingFactor = 0.2; // 0 = max smoothing, 1 = no smoothing

// Calibration noise measurement
let isCalibrating = false;
let calibrationSamples = [];
let calibrationFrames = 0;
const CALIBRATION_DURATION = 30; // frames to collect for noise measurement

// Noise threshold - variations below this are treated as zero
let noiseThresholdX = 0;
let noiseThresholdY = 0;
let noiseThresholdZ = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Initialize serial port
  port = createSerial();

  // Serial connection via 's' key press (no button)

  // Note: port.on() is not supported in this version of p5.webserial

  // Check for previously approved serial ports
  let usedPorts = usedSerialPorts();
  console.log("Previously used ports:", usedPorts);

  if (usedPorts.length > 0) {
    // Auto-connect to previously used port
    console.log("Attempting auto-connect to:", usedPorts[0]);
    port.open(usedPorts[0], BAUDRATE);
  }

  console.log("Controls:");
  console.log("  S - Connect to serial port");
  console.log(
    "  C - Calibrate (measures noise, auto-sets smoothing, zeros lines)"
  );
  console.log("  X - Toggle X axis graph (light orange)");
  console.log("  Y - Toggle Y axis graph (medium orange)");
  console.log("  Z - Toggle Z axis graph (dark orange)");
  console.log("  + - Increase smoothing manually");
  console.log("  - - Decrease smoothing manually");
}

function draw() {
  background(0);

  // Check if port is connected and read data
  if (port && port.opened()) {
    // Try to read data (readUntil returns null if no complete line available)
    let data = port.readUntil("\n");
    if (data !== null && data.length > 0) {
      parseSerialMessage(data.trim());
    }
  }

  // Draw continuous line graphs
  drawGraphs();

  // Draw baseline indicator
  if (isCalibrated) {
    drawBaseline();
  }

  // Draw status indicator
  drawStatus();
}

// Smoothing function - exponential moving average
function smoothValue(currentSmoothed, newValue, factor) {
  return currentSmoothed + (newValue - currentSmoothed) * factor;
}

// Function to parse incoming serial message
function parseSerialMessage(message) {
  // Check if message starts with 'm' (accelerometer data)
  if (message.startsWith("m")) {
    // Extract x, y, z values using regex
    let xMatch = message.match(/x=([^,\s]+)/);
    let yMatch = message.match(/y=([^,\s]+)/);
    let zMatch = message.match(/z=([^,\s]+)/);

    // Extract values or set to null if not found
    let x = xMatch ? parseFloat(xMatch[1]) : null;
    let y = yMatch ? parseFloat(yMatch[1]) : null;
    let z = zMatch ? parseFloat(zMatch[1]) : null;

    // If calibrating, collect samples for noise measurement
    if (isCalibrating && x !== null && y !== null && z !== null) {
      calibrationSamples.push({ x: x, y: y, z: z });
      calibrationFrames++;

      console.log(
        "Calibrating... (" +
          calibrationFrames +
          "/" +
          CALIBRATION_DURATION +
          ")"
      );

      if (calibrationFrames >= CALIBRATION_DURATION) {
        // Finish calibration
        finishCalibration();
      }
      return; // Don't process data during calibration
    }

    // Apply smoothing and add to data arrays if valid
    if (x !== null && y !== null && z !== null) {
      // Initialize smoothed values on first read
      if (smoothedX === 0 && smoothedY === 0 && smoothedZ === 0) {
        smoothedX = x;
        smoothedY = y;
        smoothedZ = z;
      } else {
        // Apply exponential smoothing
        smoothedX = smoothValue(smoothedX, x, smoothingFactor);
        smoothedY = smoothValue(smoothedY, y, smoothingFactor);
        smoothedZ = smoothValue(smoothedZ, z, smoothingFactor);
      }

      // Add smoothed values to data arrays
      addDataPoint(smoothedX, smoothedY, smoothedZ);
    }

    // Log extracted values (raw and smoothed)
    console.log(
      "Raw - x:",
      x,
      "y:",
      y,
      "z:",
      z,
      "| Smoothed - x:",
      smoothedX.toFixed(1),
      "y:",
      smoothedY.toFixed(1),
      "z:",
      smoothedZ.toFixed(1)
    );
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// Add data point and update max deviations for auto-scaling
function addDataPoint(x, y, z) {
  // Apply deadzone if calibrated - variations within noise threshold are zeroed
  if (isCalibrated) {
    let deviationX = x - baselineX;
    let deviationY = y - baselineY;
    let deviationZ = z - baselineZ;

    // If deviation is within noise threshold, clamp to baseline (zero it out)
    if (Math.abs(deviationX) < noiseThresholdX) {
      x = baselineX;
    }
    if (Math.abs(deviationY) < noiseThresholdY) {
      y = baselineY;
    }
    if (Math.abs(deviationZ) < noiseThresholdZ) {
      z = baselineZ;
    }
  }

  // Add new data points (with deadzone applied)
  xData.push(x);
  yData.push(y);
  zData.push(z);

  // Keep arrays at max length
  if (xData.length > maxDataPoints) {
    xData.shift();
    yData.shift();
    zData.shift();
  }

  // Update max deviations from baseline for auto-scaling
  if (isCalibrated) {
    let deviationX = Math.abs(x - baselineX);
    let deviationY = Math.abs(y - baselineY);
    let deviationZ = Math.abs(z - baselineZ);

    maxDeviationX = Math.max(maxDeviationX, deviationX);
    maxDeviationY = Math.max(maxDeviationY, deviationY);
    maxDeviationZ = Math.max(maxDeviationZ, deviationZ);
  }
}

// Draw continuous line graphs
function drawGraphs() {
  if (xData.length < 2) return;

  strokeWeight(2);

  // Draw X data in light orange (if visible)
  if (showX) {
    stroke(255, 180, 100);
    drawLine(xData, baselineX, maxDeviationX);
  }

  // Draw Y data in medium orange (if visible)
  if (showY) {
    stroke(255, 140, 60);
    drawLine(yData, baselineY, maxDeviationY);
  }

  // Draw Z data in dark orange (if visible)
  if (showZ) {
    stroke(255, 100, 20);
    drawLine(zData, baselineZ, maxDeviationZ);
  }
}

// Draw a single line with calibrated baseline positioning
// Baseline (no motion) positioned at height * 0.9
// Maximum deviation scales to reach height * 0.1
function drawLine(data, baseline, maxDeviation) {
  noFill();
  beginShape();

  let baselineY = height * 0.9; // No motion line at 90% down
  let topY = height * 0.1; // Maximum motion reaches 10% down
  let scale = (baselineY - topY) / maxDeviation; // Scale factor

  for (let i = 0; i < data.length; i++) {
    let x = map(i, 0, maxDataPoints - 1, 0, width);

    // Calculate deviation from baseline
    let deviation = data[i] - baseline;

    // Map deviation to screen position (inverted: positive deviation goes up)
    let y = baselineY - deviation * scale;

    // Clamp to screen bounds
    y = constrain(y, 0, height);

    vertex(x, y);
  }

  endShape();
}

// Draw baseline indicator at 90% down the screen
function drawBaseline() {
  let baselineY = height * 0.9;

  stroke(100, 100, 100); // Gray
  strokeWeight(1);
  line(0, baselineY, width, baselineY);

  // Label
  fill(100, 100, 100);
  noStroke();
  textSize(10);
  textAlign(RIGHT, BOTTOM);
  text("baseline", width - 5, baselineY - 2);
}

// Draw status indicator showing which graphs are visible
function drawStatus() {
  fill(255);
  noStroke();
  textSize(14);
  textAlign(LEFT, TOP);

  let statusText = "Graphs: ";
  let indicators = [];

  if (showX) indicators.push("X");
  if (showY) indicators.push("Y");
  if (showZ) indicators.push("Z");

  if (indicators.length === 0) {
    statusText += "None (press X/Y/Z to show)";
  } else {
    statusText += indicators.join(", ");
  }

  // Show calibration status
  if (isCalibrating) {
    statusText +=
      " | CALIBRATING... (" +
      calibrationFrames +
      "/" +
      CALIBRATION_DURATION +
      ")";
  } else if (isCalibrated) {
    statusText += " | Calibrated ✓";
  } else {
    statusText += " | Not calibrated (press C)";
  }

  // Show smoothing factor
  statusText += " | Smoothing: " + smoothingFactor.toFixed(2);

  text(statusText, 10, 10);
}

// Calculate standard deviation for noise measurement
function calculateStdDev(samples, axis) {
  let values = samples.map((s) => s[axis]);
  let mean = values.reduce((a, b) => a + b, 0) / values.length;
  let variance =
    values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// Finish calibration by analyzing noise and setting smoothing
function finishCalibration() {
  if (calibrationSamples.length < CALIBRATION_DURATION) {
    console.log("Not enough calibration samples");
    isCalibrating = false;
    return;
  }

  // Calculate standard deviation for each axis (measure of noise)
  let stdX = calculateStdDev(calibrationSamples, "x");
  let stdY = calculateStdDev(calibrationSamples, "y");
  let stdZ = calculateStdDev(calibrationSamples, "z");

  // Average noise across all axes
  let avgNoise = (stdX + stdY + stdZ) / 3;

  console.log("Noise measurement:");
  console.log("  X stddev:", stdX.toFixed(2));
  console.log("  Y stddev:", stdY.toFixed(2));
  console.log("  Z stddev:", stdZ.toFixed(2));
  console.log("  Average noise:", avgNoise.toFixed(2));

  // Set noise thresholds - use 2x standard deviation to capture ~95% of noise
  // Variations within this threshold will be treated as zero (deadzone)
  noiseThresholdX = stdX * 2;
  noiseThresholdY = stdY * 2;
  noiseThresholdZ = stdZ * 2;

  console.log("Noise thresholds (deadzone):");
  console.log("  X:", noiseThresholdX.toFixed(2));
  console.log("  Y:", noiseThresholdY.toFixed(2));
  console.log("  Z:", noiseThresholdZ.toFixed(2));

  // Set smoothing factor based on noise level
  // More noise = lower factor (more smoothing)
  // Less noise = higher factor (less smoothing, more responsive)
  // Typical noise range: 5-50, map to smoothing range: 0.05-0.5
  smoothingFactor = map(avgNoise, 5, 50, 0.05, 0.5);
  smoothingFactor = constrain(smoothingFactor, 0.05, 0.5);

  console.log("Auto-set smoothing factor to:", smoothingFactor.toFixed(3));

  // Calculate baseline from average of samples
  let sumX = 0,
    sumY = 0,
    sumZ = 0;
  for (let sample of calibrationSamples) {
    sumX += sample.x;
    sumY += sample.y;
    sumZ += sample.z;
  }

  baselineX = sumX / calibrationSamples.length;
  baselineY = sumY / calibrationSamples.length;
  baselineZ = sumZ / calibrationSamples.length;

  // Set smoothed values to baseline
  smoothedX = baselineX;
  smoothedY = baselineY;
  smoothedZ = baselineZ;

  // Clear all data arrays and fill with baseline values (flat lines)
  xData = [];
  yData = [];
  zData = [];

  // Fill arrays with baseline values to create flat, coincident lines
  for (let i = 0; i < maxDataPoints; i++) {
    xData.push(baselineX);
    yData.push(baselineY);
    zData.push(baselineZ);
  }

  // Reset max deviations to small value
  maxDeviationX = 100;
  maxDeviationY = 100;
  maxDeviationZ = 100;

  isCalibrated = true;
  isCalibrating = false;

  console.log("Calibrated! Baseline set to:");
  console.log("  X:", baselineX.toFixed(2));
  console.log("  Y:", baselineY.toFixed(2));
  console.log("  Z:", baselineZ.toFixed(2));
  console.log(
    "All lines are now flat and coincident at baseline (height * 0.9)"
  );
  console.log(
    "Deadzone active - variations within threshold are zeroed for linear lines"
  );
}

// Key press handler for 's' to connect serial and X/Y/Z to toggle graphs
function keyPressed() {
  if (key === "s" || key === "S") {
    console.log("S key pressed - attempting to open serial port");
    if (!port.opened()) {
      port.open(BAUDRATE);
    } else {
      console.log("Port already open");
    }
  }

  if (key === "c" || key === "C") {
    // Start calibration process: collect samples to measure noise
    if (smoothedX !== 0 || smoothedY !== 0 || smoothedZ !== 0) {
      isCalibrating = true;
      calibrationSamples = [];
      calibrationFrames = 0;
      console.log(
        "Starting calibration... Keep micro:bit STILL for " +
          CALIBRATION_DURATION +
          " frames"
      );
      console.log("Measuring noise to auto-set smoothing level...");
    } else {
      console.log("No data available for calibration. Wait for data first.");
    }
  }

  if (key === "x" || key === "X") {
    showX = !showX;
    console.log("X axis graph:", showX ? "visible" : "hidden");
  }

  if (key === "y" || key === "Y") {
    showY = !showY;
    console.log("Y axis graph:", showY ? "visible" : "hidden");
  }

  if (key === "z" || key === "Z") {
    showZ = !showZ;
    console.log("Z axis graph:", showZ ? "visible" : "hidden");
  }

  if (key === "+" || key === "=") {
    smoothingFactor = Math.max(0.05, smoothingFactor - 0.05);
    console.log(
      "Smoothing increased (factor:",
      smoothingFactor.toFixed(2),
      ")"
    );
  }

  if (key === "-" || key === "_") {
    smoothingFactor = Math.min(1.0, smoothingFactor + 0.05);
    console.log(
      "Smoothing decreased (factor:",
      smoothingFactor.toFixed(2),
      ")"
    );
  }
}

function doubleClicked() {
  let fs = fullscreen();
  fullscreen(!fs);
}
