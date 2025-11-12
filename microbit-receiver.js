// Micro:bit RECEIVER Code
// This receives radio messages and forwards them to serial (USB)

radio.onReceivedString(function (receivedString) {
    led.toggle(1, 1)
    
    // FIX: Actually send the received string, not an empty string!
    // Add newline character for proper message delimiting
    serial.writeString(receivedString + "\n")
})

radio.setGroup(6)

// Optional: Show that receiver is ready
basic.showIcon(IconNames.Yes)

