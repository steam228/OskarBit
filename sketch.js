// Serial port
let port;
const BAUDRATE = 115200;
const MAX_STREAMS = 6;

let streamData = {};
let messageCount = 0;
let lastLogTime = 0;
let messagesPerSecond = 0;

// UI Settings
const TABLE_START_Y = 100;
const ROW_HEIGHT = 60;
const HEADER_HEIGHT = 50;

// Stream colors
const STREAM_COLORS = [
  [100, 150, 255],
  [100, 255, 150],
  [255, 180, 100],
  [200, 150, 255],
  [255, 150, 180],
  [255, 230, 100],
];

class DataStream {
  constructor(id) {
    this.id = id;
    this.color = STREAM_COLORS[(id - 1) % STREAM_COLORS.length];
    this.lastUpdate = Date.now();

    // Display values (smoothed)
    this.x = 0;
    this.y = 0;
    this.z = 0;

    // Raw values (for motion detection)
    this.rawX = 0;
    this.rawY = 0;
    this.rawZ = 0;

    // Calibration
    this.calibrating = true;
    this.calibrationData = [];
    this.baseX = 0;
    this.baseY = 0;
    this.baseZ = 0;
    this.deadzone = 250; // Increased for 4G range micro:bit noise (in mg)
    this.calibrationNoise = 0; // Measured noise level during calibration

    // Adaptive motion thresholds (will be set during calibration)
    this.motionThresholds = [200, 500, 1000, 2000]; // Default fallback for 4G range

    // Motion detection with hysteresis
    this.motion = 0;
    this.distance = 0; // For debugging display
    this.calibrationQuality = "UNKNOWN";
    this.lastMotionTime = Date.now(); // For stuck motion detection
  }

  startCalibration() {
    this.calibrating = true;
    this.calibrationData = [];
    console.log(`Stream ${this.id} calibrating...`);
  }

  update(x, y, z) {
    if (isNaN(x) || isNaN(y) || isNaN(z)) return;

    // Store raw values immediately
    this.rawX = x;
    this.rawY = y;
    this.rawZ = z;

    // CALIBRATION: Collect 60 samples for better validation
    if (this.calibrating) {
      this.calibrationData.push({ x, y, z });
      this.x = x;
      this.y = y;
      this.z = z;

      if (this.calibrationData.length >= 60) {
        this.finishCalibration();
      }

      this.lastUpdate = Date.now();
      return;
    }

    // NORMAL: Apply moderate smoothing to display values only
    let alpha = 0.15;
    this.x = this.x + (x - this.x) * alpha;
    this.y = this.y + (y - this.y) * alpha;
    this.z = this.z + (z - this.z) * alpha;

    // Calculate motion using RAW data (not smoothed)
    let dx = this.rawX - this.baseX;
    let dy = this.rawY - this.baseY;
    let dz = this.rawZ - this.baseZ;

    // Use proper Euclidean distance
    let euclideanDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Store for display
    this.distance = euclideanDistance;

    // Apply deadzone (ignore small sensor noise)
    let effectiveDistance = euclideanDistance;
    if (effectiveDistance < this.deadzone) {
      effectiveDistance = 0;
    }

    // Use adaptive thresholds with hysteresis (prevents flickering)
    let newMotion = this.motion;
    let hysteresis = this.motionThresholds[0] * 0.2; // 20% hysteresis
    
    // Check for motion level increases
    for (let level = 5; level >= 0; level--) {
      if (effectiveDistance >= this.motionThresholds[level]) {
        newMotion = level + 1;
        break;
      }
    }
    
    // Check for motion level decreases (with hysteresis)
    if (newMotion < this.motion) {
      let thresholdIndex = this.motion - 1;
      if (thresholdIndex >= 0 && effectiveDistance > this.motionThresholds[thresholdIndex] - hysteresis) {
        newMotion = this.motion; // Stay at current level due to hysteresis
      }
    }
    
    // Prevent getting stuck - force reset if motion level unchanged for too long while still
    if (this.motion > 0 && newMotion === this.motion && effectiveDistance < this.deadzone) {
      if (Date.now() - this.lastMotionTime > 2000) { // 2 second timeout
        newMotion = 0;
      }
    }
    
    // Update motion and timestamp
    if (newMotion !== this.motion) {
      this.lastMotionTime = Date.now();
    }
    this.motion = Math.min(5, newMotion); // Cap at level 5

    this.lastUpdate = Date.now();
  }

  finishCalibration() {
    // Calculate baseline average
    let sumX = 0, sumY = 0, sumZ = 0;
    for (let d of this.calibrationData) {
      sumX += d.x;
      sumY += d.y;
      sumZ += d.z;
    }
    this.baseX = sumX / this.calibrationData.length;
    this.baseY = sumY / this.calibrationData.length;
    this.baseZ = sumZ / this.calibrationData.length;

    // Calculate noise levels (standard deviation)
    let varX = 0, varY = 0, varZ = 0;
    for (let d of this.calibrationData) {
      varX += Math.pow(d.x - this.baseX, 2);
      varY += Math.pow(d.y - this.baseY, 2);
      varZ += Math.pow(d.z - this.baseZ, 2);
    }
    varX /= this.calibrationData.length;
    varY /= this.calibrationData.length;
    varZ /= this.calibrationData.length;

    let stdX = Math.sqrt(varX);
    let stdY = Math.sqrt(varY);
    let stdZ = Math.sqrt(varZ);
    
    // Overall noise level
    this.calibrationNoise = Math.sqrt(stdX * stdX + stdY * stdY + stdZ * stdZ);

    // Validate calibration quality (adjusted for 4G range)
    if (this.calibrationNoise > 500) {
      this.calibrationQuality = "POOR - Device was moving";
    } else if (this.calibrationNoise > 250) {
      this.calibrationQuality = "FAIR - Some movement detected";
    } else {
      this.calibrationQuality = "GOOD - Device was steady";
    }

    // Set adaptive deadzone based on measured noise (for 4G range)
    this.deadzone = Math.max(250, this.calibrationNoise * 2.5);

    // Set adaptive motion thresholds based on noise level (expanded 6-level system)
    let baseThreshold = Math.max(300, this.calibrationNoise * 4);
    this.motionThresholds = [
      baseThreshold,           // 0->1: Still -> Micro
      baseThreshold * 1.8,     // 1->2: Micro -> Slight  
      baseThreshold * 3.5,     // 2->3: Slight -> Moderate
      baseThreshold * 6,       // 3->4: Moderate -> Active
      baseThreshold * 10,      // 4->5: Active -> Energetic
      baseThreshold * 16       // 5->max: Energetic -> Maximum
    ];

    // Initialize smoothed values to baseline
    this.x = this.baseX;
    this.y = this.baseY;
    this.z = this.baseZ;

    this.calibrating = false;
    console.log(
      `Stream ${this.id} calibrated | Noise: ${this.calibrationNoise.toFixed(1)}mg | Quality: ${this.calibrationQuality} | Deadzone: ${this.deadzone.toFixed(0)}mg`
    );
  }

  isActive() {
    return Date.now() - this.lastUpdate < 5000;
  }

  getStatus() {
    if (this.calibrating) {
      return `CAL ${Math.floor((this.calibrationData.length / 60) * 100)}%`;
    }
    return this.calibrationQuality === "GOOD - Device was steady" ? "READY" : "ACTIVE";
  }

  getMotionLabel() {
    return ["STILL", "MICRO", "SLIGHT", "MODERATE", "ACTIVE", "ENERGETIC"][this.motion];
  }

  getMotionColor() {
    return [
      [80, 80, 80],       // Still - dark gray
      [120, 120, 200],    // Micro - light blue
      [100, 200, 100],    // Slight - light green
      [255, 200, 0],      // Moderate - yellow
      [255, 140, 60],     // Active - orange
      [255, 100, 100],    // Energetic - red
    ][this.motion];
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  frameRate(60);

  port = createSerial();
  let usedPorts = usedSerialPorts();
  if (usedPorts.length > 0) {
    port.open(usedPorts[0], BAUDRATE);
  }

  console.log("=== DATA MONITOR ===");
  console.log("Press 'S' to connect");
  console.log("Press 'C' to recalibrate all streams");
}

function draw() {
  background(20);

  // Read data (limit to prevent lag)
  if (port && port.opened()) {
    for (let i = 0; i < 50; i++) {
      let data = port.readUntil("\n");
      if (!data) break;
      parseMessage(data.trim());
    }
  }

  drawHeader();
  drawTable();
  drawStatusPanel();
  updateStats();
}

function parseMessage(msg) {
  messageCount++;

  // Registration: S1-S6
  let reg = msg.match(/^S([1-6])$/);
  if (reg) {
    let id = parseInt(reg[1]);
    if (!streamData[id]) {
      streamData[id] = new DataStream(id);
      console.log(`Stream ${id} registered`);
    }
    return;
  }

  // Data: m1-m6
  let data = msg.match(/^m([1-6])/);
  if (data) {
    let id = parseInt(data[1]);

    if (!streamData[id]) {
      streamData[id] = new DataStream(id);
    }

    let xm = msg.match(/x=([^,\s]+)/);
    let ym = msg.match(/y=([^,\s]+)/);
    let zm = msg.match(/z=([^,\s]+)/);

    if (xm && ym && zm) {
      streamData[id].update(
        parseFloat(xm[1]),
        parseFloat(ym[1]),
        parseFloat(zm[1])
      );
    }
  }
}

function drawHeader() {
  fill(150, 200, 255);
  noStroke();
  textAlign(CENTER, TOP);
  textSize(28);
  textStyle(BOLD);
  text("Real-Time Motion Monitor", width / 2, 20);
  
  // Connection status
  textAlign(CENTER, TOP);
  textSize(16);
  textStyle(NORMAL);
  if (port && port.opened()) {
    fill(100, 255, 100);
    text("● Connected", width / 2, 55);
  } else {
    fill(255, 100, 100);
    text("○ Press 'S' to connect", width / 2, 55);
  }
}

function drawTable() {
  let w = min(900, width - 40);
  let x = (width - w) / 2;
  let y = TABLE_START_Y;

  // Background
  fill(30);
  stroke(80);
  strokeWeight(2);
  rect(x, y, w, HEADER_HEIGHT + ROW_HEIGHT * MAX_STREAMS);

  // Header
  fill(60);
  noStroke();
  rect(x, y, w, HEADER_HEIGHT);

  fill(200);
  textSize(18);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);

  let col = w / 7;
  text("Stream", x + col * 0.5, y + HEADER_HEIGHT / 2);
  text("Status", x + col * 1.5, y + HEADER_HEIGHT / 2);
  text("Motion", x + col * 2.5, y + HEADER_HEIGHT / 2);
  text("Distance", x + col * 3.5, y + HEADER_HEIGHT / 2);
  text("X", x + col * 4.5, y + HEADER_HEIGHT / 2);
  text("Y", x + col * 5.5, y + HEADER_HEIGHT / 2);
  text("Z", x + col * 6.5, y + HEADER_HEIGHT / 2);

  stroke(80);
  strokeWeight(2);
  line(x, y + HEADER_HEIGHT, x + w, y + HEADER_HEIGHT);

  // Rows
  textStyle(NORMAL);
  textSize(16);

  for (let i = 1; i <= MAX_STREAMS; i++) {
    let ry = y + HEADER_HEIGHT + (i - 1) * ROW_HEIGHT;

    if (i % 2 === 0) {
      fill(35);
      noStroke();
      rect(x, ry, w, ROW_HEIGHT);
    }

    let s = streamData[i];
    let active = s && s.isActive();

    // Dot
    if (active) {
      fill(s.color[0], s.color[1], s.color[2]);
      noStroke();
      circle(x + col * 0.3, ry + ROW_HEIGHT / 2, 15);
    }

    // ID
    fill(active ? 255 : 100);
    textAlign(CENTER, CENTER);
    text(`S${i}`, x + col * 0.5, ry + ROW_HEIGHT / 2);

    // Status
    if (active) {
      fill(s.calibrating ? [255, 200, 0] : [100, 255, 100]);
      text("●", x + col * 1.3, ry + ROW_HEIGHT / 2);
      fill(200);
      textSize(14);
      text(s.getStatus(), x + col * 1.7, ry + ROW_HEIGHT / 2);
      textSize(16);
    } else {
      fill(100);
      text("○", x + col * 1.3, ry + ROW_HEIGHT / 2);
      textSize(14);
      text("INACTIVE", x + col * 1.7, ry + ROW_HEIGHT / 2);
      textSize(16);
    }

    // Motion
    if (active && !s.calibrating) {
      let mc = s.getMotionColor();
      fill(mc[0], mc[1], mc[2]);
      textSize(24);
      textStyle(BOLD);
      text(s.motion, x + col * 2.2, ry + ROW_HEIGHT / 2);
      textSize(11);
      textStyle(NORMAL);
      text(s.getMotionLabel(), x + col * 2.7, ry + ROW_HEIGHT / 2);
      textSize(16);
    } else {
      fill(80);
      text("---", x + col * 2.5, ry + ROW_HEIGHT / 2);
    }

    // Distance (debugging)
    if (active && !s.calibrating) {
      fill(200);
      textSize(14);
      text(s.distance.toFixed(0) + " mg", x + col * 3.5, ry + ROW_HEIGHT / 2);
      textSize(16);
    } else {
      fill(80);
      textSize(14);
      text("---", x + col * 3.5, ry + ROW_HEIGHT / 2);
      textSize(16);
    }

    // Values
    if (active) {
      fill(255);
      text(s.x.toFixed(0), x + col * 4.5, ry + ROW_HEIGHT / 2);
      text(s.y.toFixed(0), x + col * 5.5, ry + ROW_HEIGHT / 2);
      text(s.z.toFixed(0), x + col * 6.5, ry + ROW_HEIGHT / 2);
    } else {
      fill(80);
      text("---", x + col * 4.5, ry + ROW_HEIGHT / 2);
      text("---", x + col * 5.5, ry + ROW_HEIGHT / 2);
      text("---", x + col * 6.5, ry + ROW_HEIGHT / 2);
    }

    stroke(80);
    strokeWeight(1);
    line(x, ry + ROW_HEIGHT, x + w, ry + ROW_HEIGHT);
  }
}

function drawStatusPanel() {
  let w = min(900, width - 40);
  let x = (width - w) / 2;
  let tableEndY = TABLE_START_Y + HEADER_HEIGHT + ROW_HEIGHT * MAX_STREAMS;
  let panelY = tableEndY + 20;
  let panelHeight = 160;

  // Background panel
  fill(30);
  stroke(80);
  strokeWeight(2);
  rect(x, panelY, w, panelHeight);

  // Panel header
  fill(60);
  noStroke();
  rect(x, panelY, w, 30);

  fill(200);
  textAlign(CENTER, CENTER);
  textSize(16);
  textStyle(BOLD);
  text("System Status", x + w / 2, panelY + 15);

  // Content area
  textAlign(LEFT, TOP);
  textStyle(NORMAL);
  let contentX = x + 20;
  let contentY = panelY + 40;
  let col1 = 0;
  let col2 = w * 0.33;
  let col3 = w * 0.66;
  let lineHeight = 20;

  // Column 1: Stream Statistics
  fill(150, 200, 255);
  textSize(14);
  textStyle(BOLD);
  text("Stream Statistics", contentX + col1, contentY);
  
  textStyle(NORMAL);
  textSize(12);
  let activeCount = Object.values(streamData).filter((s) => s.isActive()).length;
  let calibratedCount = Object.values(streamData).filter((s) => s.isActive() && !s.calibrating && s.calibrationQuality.includes("GOOD")).length;
  
  fill(200);
  text(`Active Streams: ${activeCount}/${MAX_STREAMS}`, contentX + col1, contentY + lineHeight);
  text(`Well Calibrated: ${calibratedCount}/${activeCount}`, contentX + col1, contentY + lineHeight * 2);
  text(`Data Rate: ${messagesPerSecond} msg/sec`, contentX + col1, contentY + lineHeight * 3);
  text(`Frame Rate: ${int(frameRate())} fps`, contentX + col1, contentY + lineHeight * 4);

  // Column 2: Stream Details
  fill(150, 200, 255);
  textSize(14);
  textStyle(BOLD);
  text("Stream Details", contentX + col2, contentY);
  
  textStyle(NORMAL);
  textSize(12);
  let detailY = contentY + lineHeight;
  
  for (let streamId in streamData) {
    let stream = streamData[streamId];
    if (!stream.isActive() || detailY > contentY + lineHeight * 4.5) continue;
    
    // Stream color indicator
    fill(stream.color[0], stream.color[1], stream.color[2]);
    circle(contentX + col2 - 5, detailY + 6, 8);
    
    fill(200);
    let statusText = `S${streamId}: `;
    if (stream.calibrating) {
      statusText += `Calibrating ${Math.floor((stream.calibrationData.length / 60) * 100)}%`;
    } else {
      statusText += `${stream.calibrationQuality.split(' - ')[0]} | Motion: ${stream.getMotionLabel()}`;
    }
    text(statusText, contentX + col2 + 5, detailY);
    detailY += lineHeight * 0.8;
  }

  // Column 3: Motion Thresholds & Controls
  fill(150, 200, 255);
  textSize(14);
  textStyle(BOLD);
  text("Motion Analysis", contentX + col3, contentY);
  
  textStyle(NORMAL);
  textSize(12);
  fill(200);
  text("Adaptive thresholds per stream", contentX + col3, contentY + lineHeight);
  text("Based on calibration noise", contentX + col3, contentY + lineHeight * 2);
  text("Uses Euclidean distance", contentX + col3, contentY + lineHeight * 3);
  
  // Controls hint at bottom
  fill(120);
  textAlign(CENTER, CENTER);
  textSize(12);
  text("'S' = Connect | 'C' = Recalibrate All | Double-click = Fullscreen", 
       x + w/2, panelY + panelHeight - 15);
}

function updateStats() {
  let t = millis();
  if (t - lastLogTime >= 1000) {
    messagesPerSecond = messageCount;
    messageCount = 0;
    lastLogTime = t;
  }
}

function keyPressed() {
  if (key === "s" || key === "S") {
    if (!port.opened()) {
      port.open(BAUDRATE);
    }
  }

  // Recalibrate all active streams
  if (key === "c" || key === "C") {
    let count = 0;
    for (let id in streamData) {
      if (streamData[id].isActive()) {
        streamData[id].startCalibration();
        count++;
      }
    }
    if (count > 0) {
      console.log(`Recalibrating ${count} stream(s) - keep devices STILL`);
    } else {
      console.log("No active streams to calibrate");
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function doubleClicked() {
  fullscreen(!fullscreen());
}
