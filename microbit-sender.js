// Micro:bit SENDER Code
// This sends accelerometer data via radio to the receiver

let s = "";
let degrees = 0;
radio.setGroup(6);
input.setAccelerometerRange(AcceleratorRange.FourG);

// Set your stream ID here (1-6)
let id = 2;

// Send registration message on startup
let hello = "S" + id;
radio.sendString(hello);

basic.forever(function () {
  led.toggle(0, 0);
  degrees = input.compassHeading();

  // FIX: Add spaces between x=, y=, z= for proper parsing
  s =
    "m" +
    id +
    " x=" +
    input.acceleration(Dimension.X) +
    " y=" +
    input.acceleration(Dimension.Y) +
    " z=" +
    input.acceleration(Dimension.Z);

  radio.sendString(s);

  // RECOMMENDED: Add a small delay to prevent overload
  // Without delay, micro:bit sends at ~50-100 Hz which can overwhelm the receiver
  basic.pause(50); // Sends ~20 messages/second - good balance of responsiveness and stability
});
