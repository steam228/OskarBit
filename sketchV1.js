// Serial port variable
let port;
const BAUDRATE = 115200;

// Motion tracking variables
let posX = 0; // Current pen position X
let posY = 0; // Current pen position Y
let velX = 0; // Velocity X
let velY = 0; // Velocity Y

// Acceleration data (from sensor)
let accelX = 0;
let accelY = 0;
let accelZ = 0;

// Calibration baseline (gravity when flat)
let baselineX = 0;
let baselineY = 0;
let baselineZ = -1000; // Gravity pointing down when flat

// Scaling factors to convert acceleration to motion
// These can be adjusted to control sensitivity
const ACCEL_TO_VELOCITY_SCALE = 0.001; // How much acceleration affects velocity
const VELOCITY_DAMPING = 0.95; // Damping to prevent runaway motion (0-1)

// Drawing
const CIRCLE_RADIUS = 6;
let points = []; // Store all drawn points

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(0);

  // Start at top left corner
  posX = 0;
  posY = 0;

  // Initialize serial port
  port = createSerial();

  // Check for previously approved serial ports
  let usedPorts = usedSerialPorts();
  console.log("Previously used ports:", usedPorts);

  if (usedPorts.length > 0) {
    // Auto-connect to previously used port
    console.log("Attempting auto-connect to:", usedPorts[0]);
    port.open(usedPorts[0], BAUDRATE);
  }

  console.log("Press 'S' to connect to serial port");
  console.log("Press 'C' to calibrate and reset to top-left corner");
}

function draw() {
  // Don't clear background - we want to keep the drawing
  // Only clear if you want to see just the current state

  // Check if port is connected and read data
  if (port && port.opened()) {
    let data = port.readUntil("\n");
    if (data !== null && data.length > 0) {
      parseSerialMessage(data.trim());
    }
  }

  // Update velocity based on acceleration (integration)
  // Remove baseline (gravity) to get actual motion acceleration
  // Axis mapping for micro:bit on stick perpendicular to it:
  // accelX -> screen X (left/right)
  // accelY -> screen Y (up/down)
  // accelZ -> ignored (perpendicular to screen)
  let motionAccelX = accelX - baselineX;
  let motionAccelY = accelY - baselineY;

  // Set velocity directly from acceleration
  velX = motionAccelX * ACCEL_TO_VELOCITY_SCALE;
  velY -= motionAccelY * ACCEL_TO_VELOCITY_SCALE;

  // Apply damping to prevent velocity from growing indefinitely
  velX *= VELOCITY_DAMPING;
  velY *= VELOCITY_DAMPING;

  // Integrate velocity to get position
  posX += velX;
  posY += velY;

  // Keep position within bounds
  posX = constrain(posX, 0, width);
  posY = constrain(posY, 0, height);

  // Draw white circle at current position
  fill(255);
  noStroke();
  circle(posX, posY, CIRCLE_RADIUS * 2);

  // Store point for potential future use
  points.push({ x: posX, y: posY });

  // Display debug info
  displayDebugInfo();
}

// Function to parse incoming serial message
function parseSerialMessage(message) {
  // Check if message starts with 'm' (accelerometer data)
  if (message.startsWith("m1")) {
    // Extract x, y, z values using regex
    let xMatch = message.match(/x=([^,\s]+)/);
    let yMatch = message.match(/y=([^,\s]+)/);
    let zMatch = message.match(/z=([^,\s]+)/);

    // Extract values or set to null if not found
    let x = xMatch ? parseFloat(xMatch[1]) : null;
    let y = yMatch ? parseFloat(yMatch[1]) : null;
    let z = zMatch ? parseFloat(zMatch[1]) : null;

    // Update acceleration values if valid
    if (x !== null && y !== null && z !== null) {
      accelX = x;
      accelY = y;
      accelZ = z;
    }

    // Log extracted values (accelX->screenX, accelY->screenY)
    console.log(
      "Accel - x:",
      x,
      "y:",
      y,
      "z:",
      z,
      "| Vel - x:",
      velX.toFixed(2),
      "y:",
      velY.toFixed(2),
      "| Pos - x:",
      posX.toFixed(0),
      "y:",
      posY.toFixed(0)
    );
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// Key press handler
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
    console.log("C key pressed - calibrating and resetting");
    // Calibrate: set current acceleration as baseline (gravity)
    baselineX = accelX;
    baselineY = accelY;
    baselineZ = accelZ;

    // Reset position to top-left corner
    posX = 0;
    posY = 0;

    // Reset velocity
    velX = 0;
    velY = 0;

    // Clear the canvas
    background(0);
    points = [];

    console.log(
      "Calibrated to: x=" + baselineX + ", y=" + baselineY + ", z=" + baselineZ
    );
  }
}

// Display debug information
function displayDebugInfo() {
  fill(255);
  noStroke();
  textSize(12);
  textAlign(LEFT, TOP);

  let debugText =
    "Acceleration: X=" +
    accelX.toFixed(0) +
    " Y=" +
    accelY.toFixed(0) +
    " Z=" +
    accelZ.toFixed(0);
  debugText += "\nAxis Mapping: accelX→screenX, accelY→screenY";
  debugText += "\nVelocity: X=" + velX.toFixed(2) + " Y=" + velY.toFixed(2);
  debugText += "\nPosition: X=" + posX.toFixed(0) + " Y=" + posY.toFixed(0);
  debugText +=
    "\nBaseline: X=" +
    baselineX.toFixed(0) +
    " Y=" +
    baselineY.toFixed(0) +
    " Z=" +
    baselineZ.toFixed(0);
  debugText += "\n\nPress 'S' to connect | Press 'C' to calibrate & reset";

  text(debugText, 10, 10);
}

function doubleClicked() {
  let fs = fullscreen();
  fullscreen(!fs);
}
