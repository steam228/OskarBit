# OskarBit - Multi-Stream Motion Visualization System

A real-time sensor visualization platform for micro:bit accelerometer data, featuring advanced signal processing and multiple motion analysis modes.

## 📋 Overview

OskarBit processes accelerometer data from up to 6 micro:bit devices simultaneously, providing real-time motion analysis with adaptive stabilization techniques. The system handles signal noise, calibration, and provides multiple visualization modes for different use cases.

## 🏗️ System Architecture

### Core Components

- **micro:bit sender** (`microbit-sender.js`) - Transmits accelerometer data via radio
- **micro:bit receiver** (`microbit-receiver.js`) - Receives radio data and forwards to USB serial
- **Main visualization** (`sketch.js`) - Real-time motion monitor with 5-level motion detection
- **Graph visualization** (`sketchGraphs.js`) - Multi-stream time-series graphs
- **Single stream mode** (`sketchSingle.js`) - Single device graph with advanced filtering
- **Motion tracking** (`sketchV1.js`) - Converts accelerometer data to 2D motion tracking

## 📡 Signal Processing Pipeline

### 1. Data Collection
Each micro:bit sender transmits accelerometer data at ~20Hz with the message format:
```
Registration: S1-S6 (registers stream 1-6)
Data: m1 x=123 y=456 z=789 (stream 1 with X/Y/Z values)
```

### 2. Signal Reception and Parsing
- Radio group 6 for device communication
- Serial USB connection at 115200 baud
- Real-time message parsing with regex pattern matching
- Automatic stream registration and data validation

### 3. Calibration System
The system performs automatic calibration to establish baseline values:

**Calibration Process** (`sketch.js:149-211`):
- Collects 60 samples when device is stationary
- Calculates mean baseline values for X, Y, Z axes
- Measures noise levels using standard deviation
- Sets adaptive thresholds based on measured noise

**Quality Assessment**:
- **GOOD**: < 250mg noise - device was steady
- **FAIR**: 250-500mg noise - some movement detected  
- **POOR**: > 500mg noise - device was moving during calibration

### 4. Stabilization Techniques

#### A. Adaptive Deadzone (`sketch.js:108-112`)
Eliminates sensor noise by ignoring small variations:
```javascript
if (effectiveDistance < this.deadzone) {
  effectiveDistance = 0;
}
```
- Deadzone = max(250mg, calibrationNoise × 2.5)
- Dynamically adjusts to measured device noise
- Prevents false motion detection from sensor drift

#### B. Exponential Smoothing (`sketchGraphs.js:401-403`)
Applies configurable smoothing to reduce signal jitter:
```javascript
smoothedValue = currentValue + (newValue - currentValue) × smoothingFactor
```
- **Factor 0.05-0.5**: Lower values = more smoothing
- Automatically set based on calibration noise levels
- Balances responsiveness vs. stability

#### C. Hysteresis-Based Motion Detection (`sketch.js:113-144`)
Prevents motion level flickering using different thresholds for increasing/decreasing motion:
- **Increase threshold**: Direct level comparison
- **Decrease threshold**: 20% hysteresis buffer
- **Stuck protection**: Auto-reset after 2 seconds of inactivity

## 🎯 5-Level Motion Detection System

The system classifies motion into 6 distinct levels (0-5):

| Level | Name | Threshold | Color | Description |
|-------|------|-----------|-------|-------------|
| 0 | STILL | < deadzone | Dark Gray | No motion detected |
| 1 | MICRO | baseThreshold | Light Blue | Minimal movement |
| 2 | SLIGHT | threshold × 1.8 | Light Green | Small gestures |
| 3 | MODERATE | threshold × 3.5 | Yellow | Regular movement |
| 4 | ACTIVE | threshold × 6 | Orange | Energetic motion |
| 5 | ENERGETIC | threshold × 10 | Red | Maximum activity |

**Adaptive Thresholds** (`sketch.js:192-200`):
- Base threshold = max(300mg, calibrationNoise × 4)
- Scales exponentially for higher motion levels
- Accounts for individual device noise characteristics

## 🔧 Key Features

### Multi-Stream Support
- **Concurrent Processing**: Up to 6 micro:bit devices
- **Individual Calibration**: Each stream has independent baseline and thresholds
- **Color Coding**: Unique color schemes for easy identification
- **Stream Management**: Auto-registration and activity monitoring

### Performance Optimization
- **Frame Rate Control**: Capped at 60 FPS for stability
- **Message Limiting**: Processes max 20 messages per frame
- **Buffer Management**: Auto-clears backlogged data to prevent freezing
- **Real-time Statistics**: Displays data rate and performance metrics

### Interactive Controls
- **S**: Connect to serial port
- **C**: Calibrate all active streams  
- **1-6**: Toggle individual stream visibility
- **R**: Clear serial buffer (graphs mode)
- **+/-**: Adjust smoothing levels

## 📊 Visualization Modes

### 1. Motion Monitor (`sketch.js`)
Real-time table view showing:
- Stream status and calibration quality
- Current motion level (0-5) with color coding
- Raw distance values for debugging
- System performance statistics

### 2. Time-Series Graphs (`sketchGraphs.js`)
Continuous line plots featuring:
- Separate X/Y/Z axis visualization
- Baseline-relative positioning
- Auto-scaling based on motion range
- Multi-stream color differentiation

### 3. Single Stream Analysis (`sketchSingle.js`)
Detailed single-device view with:
- Advanced noise filtering
- Manual smoothing control
- Calibration quality indicators
- Axis visibility toggles

### 4. Motion Tracking (`sketchV1.js`)
2D position tracking that:
- Integrates acceleration to velocity
- Converts motion to screen coordinates
- Applies physics-based damping
- Provides real-time position feedback

## 🚀 Getting Started

### Hardware Setup
1. Program one micro:bit with `microbit-receiver.js`
2. Program 1-6 micro:bits with `microbit-sender.js` (set unique IDs 1-6)
3. Connect receiver micro:bit to computer via USB
4. Set all devices to radio group 6

### Software Setup
1. Open `index.html` in a WebSerial-compatible browser (Chrome/Edge)
2. Press 'S' to connect to the micro:bit's serial port
3. Press 'C' to calibrate devices (keep stationary for 3 seconds)
4. Monitor real-time motion data and analysis

### Optimal Usage
- **Calibrate in stable environment** for best noise measurement
- **Keep devices still during calibration** for accurate baselines
- **Use appropriate visualization mode** for your analysis needs
- **Monitor system performance** to ensure real-time operation

## 🔬 Technical Specifications

- **Sampling Rate**: ~20 Hz per device
- **Accelerometer Range**: 4G (±4000mg)
- **Motion Detection Levels**: 6 (0-5)
- **Maximum Streams**: 6 concurrent devices
- **Serial Baud Rate**: 115200
- **Radio Group**: 6
- **Calibration Samples**: 60 per device
- **Buffer Auto-clear**: After 1 second of backlog

## 🎨 Signal Quality Indicators

The system provides comprehensive feedback on signal quality:
- **Green checkmark**: Well-calibrated stream
- **Yellow warning**: Fair calibration quality
- **Red indicator**: Poor calibration or high noise
- **Real-time statistics**: Message rate, frame rate, active streams
- **Buffer status**: Warnings for data backlog

This multi-faceted approach ensures robust motion detection across varying environmental conditions and device characteristics.